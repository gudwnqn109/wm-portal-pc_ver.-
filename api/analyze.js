// api/analyze.js (포털 대시보드 카드 UI 전용 구조화 응답 버전)
const ALLOWED = [
  "gudwnqn109@gmail.com", "doowon0623@gmail.com", "ablejuno@gmail.com",
  "wmhhshin@gmail.com", "wktae0907@gmail.com", "dongha1247@gmail.com",
  "ansrod1199@gmail.com", "geacha111@gmail.com", "tlstnsgho@gmail.com"
];

const MODEL_CHAIN = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash"
];

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: {
      type: "STRING",
      description: "서론·인사말 없이 핵심 결론만 1~2문장(개조식)으로 요약"
    },
    kpis: {
      type: "ARRAY",
      description: "핵심 요약 지표 3개",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING", description: "지표명 (8자 이내)" },
          value: { type: "STRING", description: "핵심 수치 또는 키워드 (12자 이내)" },
          sub: { type: "STRING", description: "보조 설명 (15자 이내)" },
          tone: { type: "STRING", enum: ["blue", "rose", "amber", "indigo"] }
        },
        required: ["label", "value", "sub", "tone"]
      }
    },
    cards: {
      type: "ARRAY",
      description: "유형별 특징 또는 핵심 인사이트 카드 2~4개",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "유형 제목 (예: 객단가 급락형, 인디안·데일리스트 부진형)" },
          badge: { type: "STRING", description: "우측 상단 뱃지 (예: 7개점 · 비중 46%, 핵심 원인)" },
          tone: { type: "STRING", enum: ["blue", "rose", "amber", "indigo"] },
          points: {
            type: "ARRAY",
            description: "핵심 특징 2~3줄 (각 줄 35자 이내 개조식)",
            items: { type: "STRING" }
          },
          stores: {
            type: "ARRAY",
            description: "해당 대표 매장 뱃지 최대 5개 (예: 양평점 -71.3%)",
            items: { type: "STRING" }
          }
        },
        required: ["title", "badge", "tone", "points", "stores"]
      }
    },
    table: {
      type: "OBJECT",
      description: "가로 스크롤 없이 한눈에 보는 압축 비교표 (열 최대 5개, 행 최대 8개)",
      properties: {
        title: { type: "STRING", description: "표 제목" },
        headers: {
          type: "ARRAY",
          description: "컬럼 헤더 4~5개 (짧은 명사형)",
          items: { type: "STRING" }
        },
        rows: {
          type: "ARRAY",
          description: "데이터 행 (각 셀 16자 이내로 간결하게 작성)",
          items: {
            type: "ARRAY",
            items: { type: "STRING" }
          }
        }
      },
      required: ["title", "headers", "rows"]
    },
    actions: {
      type: "ARRAY",
      description: "현장 즉시 실행 액션플랜 3개",
      items: {
        type: "OBJECT",
        properties: {
          target: { type: "STRING", description: "대상/담당 (예: 경기지점, 객수하락점)" },
          text: { type: "STRING", description: "실행 내용 1줄 (35자 이내)" }
        },
        required: ["target", "text"]
      }
    }
  },
  required: ["headline", "kpis", "cards", "table", "actions"]
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { userEmail, prompt, summaryPayload } = req.body || {};
  if (!ALLOWED.includes(userEmail)) {
    return res.status(403).json({ error: '허용되지 않은 사용자입니다.' });
  }

  const systemInstruction = `
너는 WM중부영업팀의 영업 데이터 애널리스트다.
반드시 전달된 JSON 수치에만 근거해 분석하고 없는 숫자를 지어내지 마라.
[작성 원칙 - 가독성 최우선]
1. "분석 결과입니다", "데이터를 바탕으로" 같은 서론·인사말은 절대 쓰지 마라.
2. 모든 문장은 "~함", "~부진", "~필요" 형태의 짧은 개조식(35자 이내)으로 압축하라.
3. 표(table)는 가로 스크롤이 생기지 않도록 반드시 4~5개 컬럼, 최대 8개 핵심 행으로만 구성하고 셀 텍스트는 16자 이내로 짧게 써라.
4. 원인 분석 시 ①객수 vs 객단가, ②5대 브랜드(인디안·브루노바피·데일리스트·더레이블·두아니) 편중, ③상권 침체 vs 단독 부진, ④평수·점정비 이력을 교차 해석하라.
  `.trim();

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{
      role: 'user',
      parts: [{
        text: `[팀원 요청]\n${prompt}\n\n[매장 집계 데이터 JSON]\n${JSON.stringify(summaryPayload)}`
      }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
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
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        try {
          const parsed = JSON.parse(rawText);
          return res.status(200).json({ result: parsed, model: modelName });
        } catch (e) {
          return res.status(200).json({ answer: rawText, model: modelName });
        }
      }

      lastError = data?.error?.message || `HTTP ${apiRes.status}`;
    } catch (err) {
      lastError = err.message;
    }
  }

  return res.status(500).json({ error: lastError });
};
