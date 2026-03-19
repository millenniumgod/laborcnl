# 네이버웍스 드라이브 연동 설정 가이드
## 노무법인 C&L — L-Master 파일 업로드 연동

---

## 전체 흐름

```
의뢰인 브라우저
    │  파일 선택 + 전송 클릭
    ▼
Cloudflare Worker (worker.js)
    │  JWT 생성 → Access Token 발급 → 드라이브 업로드
    ▼
네이버웍스 드라이브
    └─ /의뢰인 자료/[사건번호]/파일명
```

---

## STEP 1 — 네이버웍스 Developer Console 설정

1. https://developers.worksmobile.com 접속 후 로그인
2. 상단 메뉴 **API 2.0** 클릭
3. **앱 만들기** 버튼 클릭
   - 앱 이름: `CNL Drive Uploader`
   - 설명: `의뢰인 파일 업로드 연동`
4. **OAuth Scopes** 설정에서 **`drive`** 체크 후 저장
5. 생성된 앱에서 아래 값들을 복사해 메모:
   - ✅ `Client ID`
   - ✅ `Client Secret`
6. **Service Account** 섹션 → [발급] 클릭 → 생성된 Service Account 이메일 복사
7. **Private Key** 섹션 → [발행] 클릭 → `.key` 파일 다운로드
   - 이 파일을 텍스트 편집기로 열면 `-----BEGIN PRIVATE KEY-----` 로 시작하는 내용이 있습니다.
   - 그 전체 내용을 복사해 메모

---

## STEP 2 — 네이버웍스 드라이브에 수신 폴더 생성

1. 네이버웍스 드라이브 접속
2. 새 폴더 생성: 이름 `의뢰인 자료`
3. 해당 폴더를 열면 URL이 다음과 같습니다:
   ```
   https://drive.worksmobile.com/.../folders/1234567890
   ```
4. URL 끝의 숫자(`1234567890`)가 `NW_FOLDER_ID` 입니다. 복사해 메모

---

## STEP 3 — Cloudflare 계정 준비 및 Worker 배포

### 3-1. Cloudflare 계정 (무료)
https://cloudflare.com 에서 무료 계정 생성

### 3-2. Node.js 설치
https://nodejs.org 에서 LTS 버전 설치

### 3-3. Wrangler(Cloudflare CLI) 설치
터미널(명령 프롬프트)에서 실행:
```bash
npm install -g wrangler
wrangler login
```
브라우저가 열리면 Cloudflare 계정으로 로그인

### 3-4. Worker 파일 준비
다운로드한 `worker.js`와 `wrangler.toml`을 같은 폴더에 저장

### 3-5. Secret 환경변수 등록 (각 항목 실행 후 값 붙여넣기)
```bash
wrangler secret put NW_CLIENT_ID
# 프롬프트에 Client ID 입력

wrangler secret put NW_CLIENT_SECRET
# 프롬프트에 Client Secret 입력

wrangler secret put NW_SERVICE_ACCOUNT
# 프롬프트에 Service Account 이메일 입력

wrangler secret put NW_PRIVATE_KEY
# 프롬프트에 Private Key 전체 내용 붙여넣기
# (-----BEGIN PRIVATE KEY----- 부터 -----END PRIVATE KEY----- 까지)

wrangler secret put NW_FOLDER_ID
# 프롬프트에 드라이브 폴더 ID 숫자 입력

wrangler secret put ALLOWED_ORIGIN
# 프롬프트에 GitHub Pages 주소 입력
# 예: https://cnlcg.github.io
```

### 3-6. Worker 배포
```bash
wrangler deploy
```
배포 완료 시 Worker URL이 출력됩니다:
```
✅ Deployed: https://cnl-nworks-upload.YOUR-ACCOUNT.workers.dev
```

---

## STEP 4 — lmaster.html 수정

배포된 Worker URL을 `lmaster.html`에 적용합니다.

`lmaster.html`에서 아래 줄을 찾아:
```javascript
const WORKER_URL = 'https://cnl-nworks-upload.YOUR-ACCOUNT.workers.dev';
```

본인의 실제 Worker URL로 교체:
```javascript
const WORKER_URL = 'https://cnl-nworks-upload.abc123.workers.dev';
```

수정 후 `lmaster.html`을 GitHub에 push하면 완료입니다.

---

## STEP 5 — 테스트

1. 홈페이지 L-Master 페이지 접속
2. 의뢰인으로 로그인
3. 파일 선택 후 "파일 전송하기" 클릭
4. 네이버웍스 드라이브 > 의뢰인 자료 폴더에서 확인

---

## 비용 안내

| 항목 | 비용 |
|---|---|
| Cloudflare Workers (무료 플랜) | 월 100,000 요청까지 무료 |
| 네이버웍스 드라이브 | 기존 요금제 포함 |
| 추가 개발 비용 | 없음 |

---

## 문제 해결

**"Token error 401"** → Client ID / Client Secret 또는 Service Account 확인

**"폴더 생성 오류 403"** → Service Account에 드라이브 접근 권한 필요.
네이버웍스 Admin 콘솔에서 Service Account를 드라이브 멤버로 추가

**CORS 오류** → `ALLOWED_ORIGIN`에 GitHub Pages 주소가 정확히 입력되었는지 확인
(`https://` 포함, 끝에 `/` 없이)

**"허용되지 않는 파일 형식"** → PDF, DOC, DOCX, JPG, PNG, XLSX, HWP, ZIP만 허용

---

## 연락처
추가 문제 발생 시 GitHub Issues 또는 cnlcg@cnlcg.co.kr 으로 문의
