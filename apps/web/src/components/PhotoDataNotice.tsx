import { useCoverageAudit } from "../features/explore/useCoverageAudit";

/** Regional build years are not capture dates for individual streamed models. */
export default function PhotoDataNotice() {
  const { data: audit, isPending, refetch } = useCoverageAudit();
  if (!audit) {
    return (
      <div className="photo-data-notice" role="status">
        <p>
          {isPending
            ? "점검 자료를 불러오고 있어요."
            : "점검 자료를 불러오지 못했어요."}
        </p>
        {!isPending && (
          <button className="data-link" onClick={() => void refetch()}>
            다시 불러오기
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="photo-data-notice">
      <dl>
        <div>
          <dt>서울 지역 구축연도</dt>
          <dd>
            {audit.vworld.regionalBuildYear}년{" "}
            <small>브이월드 공식 구축표</small>
          </dd>
        </div>
        <div>
          <dt>건물별 촬영일</dt>
          <dd>미확인</dd>
        </div>
        <div>
          <dt>실사 누락 여부</dt>
          <dd>미확인</dd>
        </div>
      </dl>
      <p>
        건물 윤곽 {audit.footprints.count.toLocaleString()}개를 점검했습니다.
        실사 모델 목록이 없어 건물별 누락 수는 확정할 수 없습니다. 구축연도는
        촬영일과 다르며 현재 모습과 차이가 있을 수 있어요.
      </p>
      <a
        className="data-link"
        href={audit.smap.freeViewerUrl}
        target="_blank"
        rel="noreferrer"
      >
        S-Map에서 방이2동 비교 ↗
      </a>
      <p className="photo-source-note">
        서울시 외부 지도가 열립니다. {audit.smap.latestSelectableYearObserved}년
        3D 건물 선택을 확인했으며, 원본 모델을 이 서비스에 가져온 것은 아닙니다.
      </p>
      <div className="photo-evidence-links">
        <a href={audit.vworld.metadataUrl} target="_blank" rel="noreferrer">
          구축연도 출처 ↗
        </a>
        <a href="/gis/building-coverage-audit.csv" download>
          건물별 점검 목록 CSV
        </a>
        <a href="/gis/coverage-audit.json" download>
          점검 근거 JSON
        </a>
      </div>
    </div>
  );
}
