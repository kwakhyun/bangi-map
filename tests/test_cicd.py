"""Deployment safety contracts, including actual env-file restoration on failure."""
import base64
import hashlib
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/cicd"))
import agent
import deploy
import release as release_module

SHA = "a" * 40
BASELINE = {"migrations": "b" * 64, "serverContract": "c" * 64}


def release():
    return {"schema": 1, "repository": "kwakhyun/bangi-map", "sha": SHA,
            "images": {name: f"fieldtwin-{name}:sha-{SHA}" for name in ("web", "api")},
            "archiveSha256": hashlib.sha256(b"archive").hexdigest(), "archiveBytes": 7,
            "sceneSha256": "d" * 64, "compatibility": BASELINE}


class ManifestTests(unittest.TestCase):
    def test_installed_contract_paths_exist_and_digest_is_reproducible(self):
        root = Path(__file__).resolve().parents[1]
        result = release_module.compatibility(root)
        self.assertEqual(result, release_module.compatibility(root))
        self.assertEqual(set(result), {"migrations", "serverContract"})

    def test_only_exact_app_images_and_approved_schema_are_accepted(self):
        deploy.validate_manifest(release(), BASELINE)
        for field, value in [("sha", "main; touch bad"), ("repository", "other/repo"),
                             ("archiveBytes", 900 * 1024**2), ("archiveSha256", "bad"),
                             ("compatibility", {**BASELINE, "migrations": "e" * 64}),
                             ("images", {"web": "untrusted:latest", "api": "untrusted:latest"})]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                deploy.validate_manifest({**release(), field: value}, BASELINE)


class WorkflowTests(unittest.TestCase):
    def test_opaque_bearer_callback_tokens_are_accepted_without_header_injection(self):
        payload = {"sealedToken": base64.b64encode(b"x" * 512).decode()}
        for token in ("ghs_example", "opaque.fake-token_123~+/=="):
            with self.subTest(valid=token), patch.object(agent.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=token.encode())):
                self.assertEqual(agent.decrypt_token(payload, Path("/example")), token)
        for token in ("", "bad\r\nAuthorization: other", "bad token", "bad=padding=value"):
            with self.subTest(invalid=token), patch.object(agent.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=token.encode())), self.assertRaises(ValueError):
                agent.decrypt_token(payload, Path("/example"))

    def setUp(self):
        self.now = datetime(2026, 10, 13, 0, 1, tzinfo=timezone.utc)
        self.request = {"id": 1, "sha": SHA, "environment": "ncp-staging", "task": "bangi:deploy",
                        "creator": {"login": "github-actions[bot]"}, "created_at": "2026-10-13T00:00:00Z",
                        "payload": {"protocol": 1, "runId": 2, "runAttempt": 1,
                                    "releaseTag": f"ncp-{SHA}-2-1", "manifestSha256": "d" * 64,
                                    "expiresAt": "2026-10-13T00:20:00Z"}}
        self.run = {"head_sha": SHA, "head_branch": "main", "event": "push", "status": "in_progress",
                    "path": ".github/workflows/verify.yml", "run_attempt": 1}
        self.jobs = {"jobs": [{"name": name, "conclusion": "success"} for name in ("verify", "package")]}
        self.branch = {"commit": {"sha": SHA}}

    def test_successful_current_main_is_accepted(self):
        payload = agent.validate_request(self.request, self.now)
        agent.validate_workflow(self.request, payload, self.run, self.jobs, self.branch)

    def test_expired_or_non_actions_requests_are_rejected(self):
        with self.assertRaises(ValueError):
            agent.validate_request(self.request, datetime(2026, 10, 13, 1, tzinfo=timezone.utc))
        self.request["creator"]["login"] = "attacker"
        with self.assertRaises(ValueError):
            agent.validate_request(self.request, self.now)

    def test_pr_wrong_workflow_canceled_run_and_stale_commit_are_rejected(self):
        for key, value in [("event", "pull_request"), ("path", "other.yml"),
                           ("status", "completed"), ("head_branch", "feature"), ("run_attempt", 2)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                agent.validate_workflow(self.request, self.request["payload"], {**self.run, key: value}, self.jobs, self.branch)
        with self.assertRaises(ValueError):
            agent.validate_workflow(self.request, self.request["payload"], self.run, self.jobs, {"commit": {"sha": "e" * 40}})

    def test_failed_or_missing_verification_cannot_deploy(self):
        for jobs in ({"jobs": []}, {"jobs": [{"name": "verify", "conclusion": "failure"},
                                             {"name": "package", "conclusion": "success"}]}):
            with self.assertRaises(ValueError):
                agent.validate_workflow(self.request, self.request["payload"], self.run, jobs, self.branch)

    def test_expired_callback_is_not_retried_forever(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            private = root / "runtime/cicd"
            private.mkdir(parents=True)
            self.request["created_at"] = "2000-01-01T00:00:00Z"
            self.request["payload"]["expiresAt"] = "2000-01-01T00:20:00Z"
            deploy.save(private / "outcome.json", {"deploymentId": 1, "state": "success"})
            with patch.object(agent, "github", return_value=[self.request]), patch.object(deploy, "recover"), patch.object(agent, "decrypt_token") as decrypt:
                agent.main(root)
            self.assertEqual(json.loads((private / "poll-state.json").read_text())["lastHandledId"], 1)
            decrypt.assert_not_called()


class TransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "runtime/cicd").mkdir(parents=True)
        self.env = self.root / "runtime/compose.env"
        self.previous = "POSTGRES_PASSWORD=private-example\nWEB_IMAGE=fieldtwin-web:0.6.2\nAPI_IMAGE=fieldtwin-api:0.6.2\n"
        self.env.write_text(self.previous)
        (self.root / "runtime/cicd/baseline.json").write_text(json.dumps(BASELINE))
        self.archive = self.root / "images.tar.gz"
        self.archive.write_bytes(b"archive")
        self.before = {"db": {"Id": "db-preserved"}, "web": {"Image": "old-web"}, "fieldtwin-api": {"Image": "old-api"}}
        self.dc = patch.object(deploy, "dc", return_value="").start()
        self.health = patch.object(deploy, "health").start()
        self.containers = patch.object(deploy, "containers", return_value=self.before).start()
        self.check = patch.object(deploy, "check_containers").start()
        patch.object(deploy.shutil, "disk_usage", return_value=type("Disk", (), {"free": 10 * 1024**3})()).start()
        self.command = patch.object(deploy, "command", side_effect=self.fake_command).start()
        self.addCleanup(patch.stopall)

    @staticmethod
    def fake_command(args, *unused, **kwargs):
        if args[1:3] == ["image", "inspect"]:
            return json.dumps([{"Id": "new-" + ("web" if "web" in args[3] else "api"), "Architecture": "amd64",
                                "Config": {"Labels": {"org.opencontainers.image.revision": SHA,
                                                       "org.opencontainers.image.source": deploy.SOURCE}}}])
        return ""

    def test_success_keeps_private_settings_and_records_a_restore_point(self):
        result = deploy.apply(release(), self.archive, 42, self.root)
        self.assertEqual(result["state"], "success")
        self.assertIn("POSTGRES_PASSWORD=private-example", self.env.read_text())
        self.assertIn(f"WEB_IMAGE=fieldtwin-web:sha-{SHA}", self.env.read_text())
        journal = json.loads(deploy.journal_path(self.root).read_text())
        self.assertEqual(journal["state"], "committed")
        self.assertEqual((self.root / "runtime/cicd/rollbacks" / journal["snapshot"] / "compose.env").read_text(), self.previous)
        self.check.assert_called_once_with({"web": "new-web", "fieldtwin-api": "new-api"}, "db-preserved", self.root)
        self.assertFalse(any("db" in call.args[0] for call in self.dc.call_args_list))

    def test_failed_health_restores_actual_env_and_verifies_previous_images(self):
        self.health.side_effect = [None, RuntimeError("unhealthy candidate"), None]
        result = deploy.apply(release(), self.archive, 42, self.root)
        self.assertTrue(result["rolledBack"])
        self.assertEqual(self.env.read_text(), self.previous)
        self.assertEqual(json.loads(deploy.journal_path(self.root).read_text())["state"], "rolled_back")
        self.check.assert_called_once_with({"web": "old-web", "fieldtwin-api": "old-api"}, "db-preserved", self.root)

    def test_corrupt_archive_does_not_stop_any_container(self):
        self.archive.write_bytes(b"tampered")
        with self.assertRaises(ValueError):
            deploy.apply(release(), self.archive, 42, self.root)
        self.dc.assert_not_called()
        self.command.assert_not_called()

    def test_interrupted_transaction_recovers_on_next_service_start(self):
        self.health.side_effect = [None, RuntimeError("unhealthy"), RuntimeError("interrupted restore")]
        with self.assertRaises(RuntimeError):
            deploy.apply(release(), self.archive, 42, self.root)
        self.assertEqual(json.loads(deploy.journal_path(self.root).read_text())["state"], "pending")
        self.health.side_effect = None
        self.assertTrue(deploy.recover(self.root)["rolledBack"])
        self.assertEqual(self.env.read_text(), self.previous)
        self.assertIsNone(deploy.recover(self.root))

    def test_crash_after_commit_recovers_callback_without_redeploying(self):
        deploy.apply(release(), self.archive, 42, self.root)
        self.dc.reset_mock()
        self.assertIsNone(deploy.recover(self.root))
        self.dc.assert_not_called()
        outcome = json.loads((self.root / "runtime/cicd/outcome.json").read_text())
        self.assertEqual(outcome["deploymentId"], 42)
        self.assertEqual(outcome["state"], "success")

    def test_recovery_does_not_overwrite_a_newer_rejected_request(self):
        deploy.apply(release(), self.archive, 42, self.root)
        outcome_path = self.root / "runtime/cicd/outcome.json"
        deploy.save(outcome_path, {"deploymentId": 43, "state": "failure"})
        self.health.reset_mock()
        deploy.recover(self.root)
        self.health.assert_not_called()
        self.assertEqual(json.loads(outcome_path.read_text())["deploymentId"], 43)

    def test_callback_recovery_rolls_back_if_committed_containers_are_unhealthy(self):
        deploy.apply(release(), self.archive, 42, self.root)
        self.health.side_effect = [RuntimeError("restart before callback"), None]
        self.assertTrue(deploy.recover(self.root)["rolledBack"])
        self.assertEqual(self.env.read_text(), self.previous)


if __name__ == "__main__":
    unittest.main()
