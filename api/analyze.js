// api/analyze.js (Flash-Lite 우선 + 자동 폴백 버전)
const ALLOWED = [
  "gudwnqn109@gmail.com", "doowon0623@gmail.com", "ablejuno@gmail.com",
  "wmhhshin@gmail.com", "wktae0907@gmail.com", "dongha1247@gmail.com",
  "ansrod1199@gmail.com", "geacha111@gmail.com", "tlstnsgho@gmail.com"
];

// 무료 티어 한도가 넉넉한 Flash-Lite 최신 별칭 우선 호출, 오류 시 예비 모델 자동 전환
const MODEL_CHAIN = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash"
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { userEmail, prompt, summaryPayload } = req.body || {};
  if (!ALLOWED.includes(userEmail)) {
    return res.status(403).json({ error: '허용되지 않은 사용자입니다.' });
  }

  const systemInstruction = `
너는 패션 리테일 WM중부영업팀의 수석 영업 데이터 애널리스트다.
반드시 전달된 JSON 수치에 근거해서만 분석하고, 없는 숫자를 지어내지 마라.
출력은 팀원들이 회의·보고에 바로 활용할 수 있도록 마크다운 표와 핵심 불릿 3~5개로 간결하게 정리하라.
수치 분석 시 '객수 vs 객단가', '특정 브랜드 편중', '상권 전체 침체 vs 단독 부진', '매장 평수·점정비 이력' 관점을 교차 해석하라.
  `.trim();

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{
      role: 'user',
      parts: [{
        text: `[팀원 요청]\n${prompt}\n\n[매장 집계 데이터 JSON]\n${JSON.stringify(summaryPayload)}`
      }]
    }],
    generationConfig: { temperature: 0.2 }
  });

  let lastError = 'AI 모델 호출에 실패했습니다.';

  for (const modelName of MODEL_CHAIN) {
    try {
      const apiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
        }
      );

      const data = await apiRes.json();
      if (apiRes.ok) {
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || '분석 결과를 생성하지 못했습니다.';
        return res.status(200).json({ answer, model: modelName });
      }

      lastError = data?.error?.message || `HTTP ${apiRes.status}`;
    } catch (err) {
      lastError = err.message;
    }
  }

  return res.status(500).json({ error: lastError });
};
