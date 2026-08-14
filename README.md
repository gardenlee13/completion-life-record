# 하루하루의 기록

전인적 라이프 로깅 웹 앱 — 공부 · 경험 · 재무를 최소 입력으로 기록하고 연간 목표를 게이지로 추적합니다.

## 배포 URL

- **Production:** https://completion-life-record.vercel.app
- **GitHub:** https://github.com/gardenlee13/completion-life-record

`main` 브랜치에 push하면 Vercel이 자동으로 프로덕션 배포합니다.

```bash
# 수동 재배포 (선택)
npx --yes vercel --prod --yes
```

## 실행 방법

`index.html`을 브라우저에서 열면 됩니다. (로컬 파일로 바로 실행 가능)

```bash
# 선택: 로컬 서버
npx --yes serve .
```

## 구현 범위 (PRD)

| 기능 | 상태 |
|------|------|
| 영어/일본어 공부 시간 입력 + `+0.5h` / `+1.0h` 퀵 버튼 | ✅ |
| 독서 · 어학 · 저축 연간 목표 Progress Bar 실시간 갱신 | ✅ |
| 월별 가계부 (수입/지출, 3필드, 월 요약) | ✅ |
| 경험 로그 (독서/영화/장소) — 독서 완료 시 게이지 +1 | ✅ |
| UTF-8 BOM CSV 내보내기 `exportToCSV()` | ✅ |
| Dark Mode First · Mobile First · 하단 탭바 | ✅ |

## 데이터 저장

- **LocalStorage** (`completion_life_log_v1`) — 오프라인·즉시 저장
- **Firebase Firestore** (`completion-life-log` / `users/{syncId}`) — 클라우드 동기화
- 설정 탭의 **동기화 ID**로 기기 간 이어보기 가능

## CSV 내보내기

- 파일명: `completion_life_log_YYYYMMDD.csv`
- 형식: UTF-8 BOM (엑셀 한글 깨짐 방지)
- 구성: 공부 / 가계부 / 경험 **통합 1개 파일**
- 진입점: 상단 `📥 CSV` 또는 설정 탭 버튼 / `window.exportToCSV()`

## MVP에서 보류한 항목

1. 용도별 CSV 분리 다운로드
2. 매월 말 백업 알림 팝업
3. CSV/JSON Import(복원)

원하시면 바로 이어서 구현할 수 있습니다.
