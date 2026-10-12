import { useState, type FormEvent } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { Dialog } from "./Dialog";
import { api, readLocal, writeLocal } from "../api";
import { categories, type Place, type Receipt } from "../types";
export function ReportDialog({
  place,
  onClose,
}: {
  place: Place;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(""),
    [category, setCategory] = useState("INFO"),
    [photo, setPhoto] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const [keys] = useState(() => ({
    requestKey: crypto.randomUUID(),
    receiptToken: crypto.randomUUID() + crypto.randomUUID(),
  }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Save the receipt secret before sending so a successful response lost in transit can be retried.
      const retained = readLocal<Receipt[]>("bangi-receipts", []);
      writeLocal("bangi-receipts", [
        { id: keys.requestKey, token: keys.receiptToken, name: place.name },
        ...retained.filter((x) => x.id !== keys.requestKey),
      ]);
      const r = await api<{ id: string }>("/reports", {
        method: "POST",
        body: JSON.stringify({
          placeId: place.id,
          category,
          description,
          photo,
          ...keys,
        }),
      });
      const items = readLocal<Receipt[]>("bangi-receipts", []);
      writeLocal("bangi-receipts", [
        { id: r.id, token: keys.receiptToken, name: place.name },
        ...items.filter((x) => x.id !== r.id),
      ]);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "접수하지 못했습니다. 브라우저 저장 공간도 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={done ? "제보가 접수됐어요" : "함께 정확한 지도를 만들어요"}
      onClose={onClose}
    >
      {done ? (
        <div className="success-state">
          <CheckCircle2 size={48} />
          <h3>알려주셔서 고맙습니다</h3>
          <p>
            운영자가 내용을 확인할게요.
            <br />
            ‘내 제보’에서 처리 상태를 볼 수 있어요.
          </p>
          <button className="primary wide" onClick={onClose}>
            확인
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="form-place">{place.name}</p>
          <label>
            어떤 내용인가요?
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(categories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            자세한 내용
            <textarea
              required
              minLength={5}
              maxLength={1000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="어떤 점이 다른지 알려주세요. 개인정보는 적지 말아 주세요."
            />
          </label>
          <label className="upload">
            <Camera size={20} /> 사진 첨부{" "}
            <small>선택 · JPEG/PNG, 2MB 이하</small>
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (
                  f.size > 2_000_000 ||
                  !["image/jpeg", "image/png"].includes(f.type)
                ) {
                  setError("2MB 이하의 JPEG 또는 PNG 사진을 선택해 주세요.");
                  e.target.value = "";
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  setPhoto(String(reader.result));
                  setError("");
                };
                reader.readAsDataURL(f);
              }}
            />
          </label>
          {photo && (
            <div className="photo-preview">
              <img src={photo} alt="제보에 첨부할 사진" />
              <button type="button" onClick={() => setPhoto(null)}>
                사진 삭제
              </button>
            </div>
          )}
          <p className="notice">
            생활지도 운영자에게 전달됩니다. 구청 민원이나 긴급 신고로 접수되지
            않습니다. 접수 내역은 이 브라우저에만 저장됩니다.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="primary wide"
            disabled={busy || description.trim().length < 5}
          >
            {busy ? "접수하는 중…" : "제보 보내기"}
          </button>
        </form>
      )}
    </Dialog>
  );
}
