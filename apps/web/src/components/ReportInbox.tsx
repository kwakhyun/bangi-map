import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  MessageSquare,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { api, date, readLocal } from "../api";
import {
  type Receipt,
  type Report,
  type User,
  statuses,
  categories,
} from "../types";
import { Dialog } from "./Dialog";
export function MyReports({ onClose }: { onClose: () => void }) {
  const [receipts] = useState(() => readLocal<Receipt[]>("bangi-receipts", []));
  const q = useQuery({
    queryKey: ["my-reports", receipts],
    queryFn: () =>
      Promise.all(
        receipts.map(async (r) => {
          try {
            return {
              report: await api<Report>("/reports/" + r.id, {
                headers: { "X-Report-Token": r.token },
              }),
              receipt: r,
            };
          } catch {
            return { report: null, receipt: r };
          }
        }),
      ),
  });
  return (
    <Dialog title="내 제보" onClose={onClose}>
      <p className="muted">
        이 브라우저에서 보낸 제보입니다. 브라우저 데이터를 지우면 조회할 수
        없어요.
      </p>
      {!receipts.length ? (
        <div className="empty">
          <MessageSquare />
          <h3>아직 보낸 제보가 없어요</h3>
          <p>시설 상세 화면에서 다른 정보를 알려주세요.</p>
        </div>
      ) : q.isPending ? (
        <p>접수 내역을 불러오는 중…</p>
      ) : (
        <>
          <button className="text-button" onClick={() => q.refetch()}>
            <RefreshCw size={14} />
            새로고침
          </button>
          {q.data?.map(({ report: r, receipt }) => (
            <article className="receipt" key={receipt.id}>
              <div>
                <strong>{receipt.name}</strong>
                <span className="badge">
                  {r ? statuses[r.status] : "조회 실패"}
                </span>
              </div>
              {r ? (
                <>
                  <small>
                    {date(r.createdAt)} · {categories[r.category]}
                  </small>
                  <p>{r.description}</p>
                  {r.hasPhoto && <small>사진 1장 첨부</small>}
                  {r.response && (
                    <blockquote>
                      <strong>운영자 답변</strong>
                      <p>{r.response}</p>
                    </blockquote>
                  )}
                </>
              ) : (
                <p className="error">
                  연결을 확인하고 새로고침해 주세요. 접수가 완료되지 않았거나
                  조회 권한이 없는 내역일 수 있습니다.
                </p>
              )}
            </article>
          ))}
        </>
      )}
    </Dialog>
  );
}
export function Admin({ onBack }: { onBack: () => void }) {
  const cache = useQueryClient();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        return await api<User>("/auth/me");
      } catch {
        return null;
      }
    },
    retry: false,
  });
  const user = session.data;
  const setUser = (u: User | null) => cache.setQueryData(["session"], u);
  const q = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => api<Report[]>("/admin/reports"),
    enabled: !!user,
  });
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setUser(
        await api<User>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      );
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={18} /> 지도로 돌아가기
      </button>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">BANGI MAP · 운영</p>
          <h1>함께 만드는 생활지도</h1>
          <p className="muted">
            주민이 알려준 정보를 확인하고 처리 결과를 남겨주세요.
          </p>
        </div>
        {user && (
          <button
            className="secondary"
            onClick={async () => {
              try {
                await api("/auth/logout", {
                  method: "POST",
                  headers: { "X-CSRF-Token": user.csrfToken },
                });
                setUser(null);
                cache.removeQueries({ queryKey: ["admin-reports"] });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={16} />
            로그아웃
          </button>
        )}
      </div>
      {session.isPending ? (
        <p>접속을 확인하는 중…</p>
      ) : !user ? (
        <form className="login-card" onSubmit={login}>
          <h2>운영자 로그인</h2>
          <p className="muted">기존 스테이징 관리자 계정을 사용합니다.</p>
          <label>
            이메일
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} className="primary wide">
            {busy ? "확인하는 중…" : "로그인"}
          </button>
        </form>
      ) : (
        <>
          <div className="inbox-heading">
            <strong>
              최근 제보 {q.data?.length ?? 0}건 <small>최대 200건</small>
            </strong>
            <button className="secondary" onClick={() => q.refetch()}>
              <RefreshCw size={16} />
              새로고침
            </button>
          </div>
          {q.isPending ? (
            <p>제보를 불러오는 중…</p>
          ) : q.isError ? (
            <p className="error" role="alert">
              {q.error.message}
            </p>
          ) : !q.data?.length ? (
            <div className="empty">
              <Check />
              <h3>새로운 제보가 없어요</h3>
            </div>
          ) : (
            <div className="admin-list">
              {q.data.map((r) => (
                <AdminReport
                  key={r.id + ":" + r.version}
                  report={r}
                  user={user}
                  refresh={() => q.refetch()}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
function AdminReport({
  report: r,
  user,
  refresh,
}: {
  report: Report;
  user: User;
  refresh: () => void;
}) {
  const [status, setStatus] = useState(r.status),
    [response, setResponse] = useState(r.response),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [photo, setPhoto] = useState(false);
  return (
    <article className="admin-report">
      <div>
        <span className="badge">{statuses[r.status]}</span>
        <small>{date(r.createdAt)}</small>
      </div>
      <h3>{r.placeName}</h3>
      <p className="muted">{categories[r.category]}</p>
      <p className="report-body">{r.description}</p>
      {r.hasPhoto && (
        <>
          <button className="text-button" onClick={() => setPhoto(!photo)}>
            {photo ? "사진 접기" : "첨부 사진 보기"}
          </button>
          {photo && (
            <img
              className="report-photo"
              src={"/api/admin/reports/" + r.id + "/photo"}
              alt="제보 첨부 사진"
            />
          )}
        </>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/admin/reports/" + r.id, {
              method: "PATCH",
              headers: { "X-CSRF-Token": user.csrfToken },
              body: JSON.stringify({ status, response, version: r.version }),
            });
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          처리 상태
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          처리 결과
          <textarea
            maxLength={1000}
            rows={3}
            placeholder="제보한 분에게 전달할 내용을 작성해 주세요."
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "저장 중…" : "처리 결과 저장"}
        </button>
      </form>
    </article>
  );
}
