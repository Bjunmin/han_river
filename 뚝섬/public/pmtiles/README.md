# PMTiles 파일 디렉토리

이 디렉토리에 PMTiles 파일을 배치하세요.

## 파일 구조

```
public/pmtiles/
  ├── area.pmtiles    # 영역 데이터 PMTiles 파일
  └── line.pmtiles    # 선 데이터 PMTiles 파일
```

## 접근 URL

서버 실행 후 다음 URL로 접근할 수 있습니다:

- `http://localhost:7400/data/area.pmtiles`
- `http://localhost:7400/data/line.pmtiles`

포트는 환경 변수 `PORT`로 설정할 수 있으며, 기본값은 3000입니다.

## 주의사항

- PMTiles 파일은 HTTP Range 요청을 지원해야 합니다.
- CORS 헤더가 자동으로 설정됩니다.
- 파일이 없으면 404 오류가 발생합니다.

