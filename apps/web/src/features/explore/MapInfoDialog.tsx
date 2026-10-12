import { Dialog } from "../../components/Dialog";
import PhotoDataNotice from "../../components/PhotoDataNotice";

export function MapInfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="방이2동을 만드는 데이터" onClose={onClose}>
      <p className="intro">
        실제 동네의 모습을 담고,
        <br />
        확인할 수 있는 정보만 보여드립니다.
      </p>
      <div className="info-section">
        <h3>방이2동 경계</h3>
        <p>
          SGIS 원자료를 가공한 vuski/admdongkor의 2026년 7월 1일 경계입니다.
          계산 면적은 약 0.768㎢이며 행정동 경계 안에 좌표가 있는 시설을 기본
          표시합니다. 측량이나 법적 경계 확인 용도는 아닙니다.
        </p>
        <a
          className="data-link"
          href="https://github.com/vuski/admdongkor"
          target="_blank"
          rel="noreferrer"
        >
          경계 데이터 출처 ↗
        </a>
      </div>
      <div className="info-section">
        <h3>실사 3D: 외벽 사진과 지붕 모형</h3>
        <PhotoDataNotice />
        <p>
          실사 모형과 아래 건물 속성은 서로 다른 자료입니다. 건물을 누르면 해당
          위치의 Overture 외곽에 연결하므로 위치나 형태가 다를 수 있습니다. 원본
          실사 데이터는 내려받기 자료에 포함되지 않습니다.
        </p>
        <a
          className="data-link"
          href="https://www.vworld.kr/dev/v4dv_opnws3dmap3guide_s001.do"
          target="_blank"
          rel="noreferrer"
        >
          브이월드 공식 3D API ↗
        </a>
      </div>
      <div className="info-section">
        <h3>건물 1,484개, 높이는 구분해서</h3>
        <p>
          Overture 2026-09-23.1 배포본의 실제 건물 외곽입니다. 원본 높이 646개,
          층수 × 3.3m 추정 10개를 기본 지도에 입체로 표시합니다. 높이 정보가
          없는 828개는 평면 외곽으로 표시합니다. 원본 높이도 실측 정확도를
          보증하지 않습니다.
        </p>
        <p>
          기본 지도의 지면은 평탄한 기준면입니다. 지형 고도와 건물의 실제 지붕,
          외벽, 실내를 재현하지 않습니다. 그림자는 이 모델을 이용한 참고
          표현입니다.
        </p>
        <a
          className="data-link"
          href="https://docs.overturemaps.org/guides/buildings/"
          target="_blank"
          rel="noreferrer"
        >
          건물 데이터 출처 ↗
        </a>
      </div>
      <div className="info-section">
        <h3>생활시설과 현재 수량</h3>
        <p>
          서울시 공개 자료의 따릉이, 주차장, 화장실입니다. 따릉이는 2분,
          주차장은 5분마다 수량을 확인하며 10분 이상 지난 값은 최신 수량처럼
          표시하지 않습니다. 현재 방이2동 내부 주차장에는 실시간 잔여면 정보가
          없습니다. 주변의 연동 주차장은 ‘주변 포함’에서 확인할 수 있습니다.
        </p>
        <p>
          거리는 직선거리입니다. 길찾기는 외부 지도에서 확인합니다. 저장한
          장소와 제보 조회 권한은 이 브라우저에 보관됩니다.
        </p>
      </div>
      <div className="info-section">
        <h3>출처 및 이용 조건</h3>
        <p>
          경계: SGIS 공공누리 제1유형, 가공 vuski/admdongkor CC BY 4.0. 건물과
          도로: Overture Maps, OpenStreetMap contributors, East Asian Buildings
          (ODbL 배포본). 생활시설: 서울 열린데이터광장, 서울특별시.
        </p>
        <div className="data-downloads">
          <a href="/gis/bangi2-scene-v1.json" target="_blank" rel="noreferrer">
            가공 공간 데이터 내려받기 ↗
          </a>
          <a href="/gis/SOURCES.md" target="_blank" rel="noreferrer">
            데이터 출처와 라이선스 ↗
          </a>
        </div>
      </div>
      <p className="source-note">
        제보는 이 서비스 운영자에게 전달됩니다. 송파구청 민원이나 긴급 신고가
        아닙니다.
      </p>
    </Dialog>
  );
}
