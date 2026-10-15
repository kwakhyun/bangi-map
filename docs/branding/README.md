# 방이 생활지도 아이콘

방이의 첫 자음 `ㅂ`에서 출발해 두 건물이 연결된 모습과 접힌 지도를 하나의 심벌로 표현했다. 기존 UI의 파란색과 흰색을 사용하고, 작은 크기에서도 보이는 두 개의 창을 남겼다.

- 제작: 내장 `image_gen` 도구, 2026-10-15
- 생성 원본: [bangi-icon-source.png](bangi-icon-source.png), 1254 × 1254 PNG
- 웹 자산: `apps/web/public/brand/bangi-icon-{32,48,96,180,192,512}.png`
- 적용: 화면 상단 로고, 브라우저 탭, Apple 홈 화면 아이콘, 웹 앱 아이콘 메타데이터
- 아이콘 메타데이터는 `/site-manifest.json`에서 제공한다. 기존 Nginx MIME 설정에 맞춰 JSON 확장자를 사용한다.
- 파생 파일은 원본의 비율과 색을 유지한 채 macOS `sips`로 축소했다. 모서리 곡률은 화면에서 CSS로 적용한다.
- 매니페스트는 아이콘 메타데이터를 제공한다. 오프라인 기능이나 별도의 앱 설치 기능을 추가하지 않는다.

## 생성 프롬프트

```text
Use case: logo-brand
Asset type: final square app icon for a Korean neighborhood 3D GIS service named "방이2동 3D 생활지도" (Bangi neighborhood living map).
Primary request: Create ONE distinctive, extremely simple, polished icon. A bold white sculptural geometric mark inspired by the Korean consonant ㅂ, the initial of 방이, that also reads as two connected neighborhood building faces seen at a slight isometric angle. Use exactly two generous blue negative-space window cutouts so the symbol is recognizable at favicon size. Integrate the building/ㅂ idea into a single coherent silhouette, not a collage of symbols. Slightly rounded corners, friendly and precise.
Composition: perfectly centered single mark, approximately 66% of the canvas width and height, with generous balanced breathing room. Flat front-facing app icon artwork, 1024 by 1024, full-bleed solid vivid blue #2578ED background covering all four corners. No rounded outer tile drawn into the artwork; the app will apply its own corner radius.
Style: exceptionally clean vector-like graphic, crisp edges, two colors only: white and blue. Subtle geometric perspective in the silhouette, but NO rendered extrusion, NO gradients, NO texture, NO shadows. The geometry should feel ownable and warm, not corporate clip art.
Text: none. The mark can suggest ㅂ but do not add words, labels, letters around it, or the digit 2.
Avoid: location-pin clip art, stacked-layers generic GIS logo, maps as background, tiny details, outlines around the canvas, glossy 3D, mockup scenes, multiple icon variants, watermarks. Deliver the single finished app icon only.
```
