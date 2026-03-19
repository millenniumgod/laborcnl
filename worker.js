/**
 * ============================================================
 *  노무법인 C&L — NAVER WORKS Drive 파일 업로드 Cloudflare Worker
 * ============================================================
 *
 * [배포 전 필수 설정] Cloudflare Dashboard > Workers > Settings > Variables에
 * 아래 Secret 환경변수를 등록하세요 (절대 코드에 직접 입력 금지):
 *
 *   NW_CLIENT_ID       — 네이버웍스 Developer Console > API 2.0 > Client ID
 *   NW_CLIENT_SECRET   — 네이버웍스 Developer Console > API 2.0 > Client Secret
 *   NW_SERVICE_ACCOUNT — 네이버웍스 Developer Console > API 2.0 > Service Account
 *   NW_PRIVATE_KEY     — Private Key 파일 내용 전체 (BEGIN/END PRIVATE KEY 포함)
 *   NW_FOLDER_ID       — 파일을 받을 드라이브 폴더 ID (아래 설명 참고)
 *   ALLOWED_ORIGIN     — https://[your-github-username].github.io
 *
 * [폴더 ID 확인 방법]
 *   네이버웍스 드라이브에서 폴더를 열면 URL이
 *   https://drive.worksmobile.com/.../folders/[FOLDER_ID] 형태입니다.
 *   해당 숫자가 NW_FOLDER_ID 입니다.
 * ============================================================
 */

const WORKS_AUTH_URL  = 'https://auth.worksmobile.com/oauth2/v2.0/token';
const WORKS_API_BASE  = 'https://www.worksapis.com/v1.0';

/* ── CORS 헤더 ── */
function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  };
}

/* ── JWT 생성 (RS256) ── */
async function createJWT(clientId, serviceAccount, privateKeyPem) {
  const now     = Math.floor(Date.now() / 1000);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 3600,
  };

  const b64url = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  // PEM → ArrayBuffer
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${signingInput}.${sig}`;
}

/* ── Access Token 발급 ── */
async function getAccessToken(env) {
  const jwt = await createJWT(
    env.NW_CLIENT_ID,
    env.NW_SERVICE_ACCOUNT,
    env.NW_PRIVATE_KEY
  );

  const res = await fetch(WORKS_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      assertion:   jwt,
      grant_type:  'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id:   env.NW_CLIENT_ID,
      client_secret: env.NW_CLIENT_SECRET,
      scope:       'file',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

/* ── 드라이브에 사건별 폴더 생성 또는 기존 폴더 사용 ── */
async function ensureCaseFolder(accessToken, rootFolderId, caseName) {
  // 하위 폴더 목록 조회
  const listRes = await fetch(
    `${WORKS_API_BASE}/drive/folders/${rootFolderId}/folders`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (listRes.ok) {
    const listData = await listRes.json();
    const folders  = listData.folders || listData.data || [];
    const existing = folders.find(f => f.name === caseName || f.folderName === caseName);
    if (existing) return existing.folderId || existing.id;
  }

  // 없으면 신규 생성
  const createRes = await fetch(
    `${WORKS_API_BASE}/drive/folders/${rootFolderId}/folders`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ folderName: caseName }),
    }
  );

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`폴더 생성 오류 ${createRes.status}: ${text}`);
  }

  const folder = await createRes.json();
  return folder.folderId || folder.id;
}

/* ── 파일 업로드 ── */
async function uploadFileToDrive(accessToken, folderId, fileName, fileData, mimeType) {
  // Step 1: 업로드 URL 요청
  const initRes = await fetch(
    `${WORKS_API_BASE}/drive/folders/${folderId}/files`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name:     fileName,
        mimeType: mimeType || 'application/octet-stream',
      }),
    }
  );

  if (!initRes.ok) {
    const text = await initRes.text();
    // API 형식에 따라 multipart 방식으로 fallback
    if (initRes.status === 404 || initRes.status === 405) {
      return await uploadMultipart(accessToken, folderId, fileName, fileData, mimeType);
    }
    throw new Error(`파일 초기화 오류 ${initRes.status}: ${text}`);
  }

  const initData   = await initRes.json();
  const uploadUrl  = initData.uploadUrl || initData.upload_url;

  if (!uploadUrl) {
    return await uploadMultipart(accessToken, folderId, fileName, fileData, mimeType);
  }

  // Step 2: 실제 파일 전송
  const uploadRes = await fetch(uploadUrl, {
    method:  'PUT',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: fileData,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`파일 업로드 오류 ${uploadRes.status}: ${text}`);
  }

  return await uploadRes.json().catch(() => ({ success: true }));
}

/* ── Multipart 방식 fallback ── */
async function uploadMultipart(accessToken, folderId, fileName, fileData, mimeType) {
  const boundary = `----CNLBoundary${Date.now()}`;
  const metaPart = `--${boundary}\r\nContent-Disposition: form-data; name="fileInfo"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: fileName })}\r\n`;
  const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="fileData"; filename="${fileName}"\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;
  const tail     = `\r\n--${boundary}--`;

  const enc      = new TextEncoder();
  const body     = new Uint8Array([
    ...enc.encode(metaPart),
    ...enc.encode(filePart),
    ...(fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData)),
    ...enc.encode(tail),
  ]);

  const res = await fetch(
    `${WORKS_API_BASE}/drive/folders/${folderId}/files`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body.buffer,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Multipart 업로드 오류 ${res.status}: ${text}`);
  }

  return await res.json().catch(() => ({ success: true }));
}

/* ── 메인 핸들러 ── */
export default {
  async fetch(request, env) {
    const origin  = request.headers.get('Origin') || '';
    const cors    = corsHeaders(origin, env);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // POST only
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    try {
      // multipart/form-data 파싱
      const formData = await request.formData();
      const file     = formData.get('file');
      const caseNo   = formData.get('caseNo') || 'unknown';
      const uploader = formData.get('uploader') || '';

      if (!file || typeof file === 'string') {
        return new Response(JSON.stringify({ error: '파일이 없습니다.' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // 파일 크기 검증 (100MB)
      if (file.size > 100 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: '파일이 100MB를 초과합니다.' }), {
          status: 413, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // 확장자 검증
      const allowedExt = /\.(pdf|doc|docx|jpg|jpeg|png|gif|xlsx|xls|hwp|zip)$/i;
      if (!allowedExt.test(file.name)) {
        return new Response(JSON.stringify({ error: '허용되지 않는 파일 형식입니다.' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // 파일명 위생 처리 (path traversal 방지)
      const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._\-\s]/g, '_');

      // 접근 토큰 발급
      const accessToken = await getAccessToken(env);

      // 사건 폴더 생성 또는 확인
      const caseFolderName = `[${caseNo}] ${new Date().toISOString().slice(0,10)}`;
      const caseFolderId   = await ensureCaseFolder(
        accessToken,
        env.NW_FOLDER_ID,
        caseFolderName
      );

      // 파일 업로드
      const fileBuffer = await file.arrayBuffer();
      const result     = await uploadFileToDrive(
        accessToken,
        caseFolderId,
        safeName,
        new Uint8Array(fileBuffer),
        file.type
      );

      return new Response(
        JSON.stringify({
          success:    true,
          fileName:   safeName,
          caseNo,
          folderId:   caseFolderId,
          uploadedAt: new Date().toISOString(),
          result,
        }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );

    } catch (err) {
      console.error('Worker error:', err.message);
      return new Response(
        JSON.stringify({ error: '업로드 중 오류가 발생했습니다.', detail: err.message }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
  },
};
