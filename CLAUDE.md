# CLAUDE.md — bewithus-emr

비위더스 치료 센터의 EMR(전자의무기록) 시스템. 선생님과 대표(원장)의 두 역할로 구분된 진료 기록 관리 앱.

---

## 🎯 핵심 행동 원칙 (Karpathy Guidelines)

이 프로젝트에서의 모든 코딩은 다음 4가지 원칙을 따릅니다.

**Tradeoff:** 이 원칙들은 속도보다 신중함을 우선합니다. 간단한 작업에서는 판단력을 사용하세요.

### 1. Think Before Coding

**가정하지 마세요. 혼란을 숨기지 마세요. 트레이드오프를 드러내세요.**

구현 전에:

* 가정을 명시적으로 명시하세요. 불확실하면 질문하세요.
* 여러 해석이 존재하면, 모두 제시하세요 - 조용히 선택하지 마세요.
* 더 간단한 접근법이 존재하면, 말하세요. 필요할 때 반박하세요.
* 뭔가 불명확하면, 멈추세요. 혼란스러운 점을 명시하세요. 질문하세요.

**이 프로젝트 관련:**
- `Record` 타입이 이미 도메인 타입으로 사용 중인지 확인하세요 (JS 내장 `Record<K,V>`와 혼동하지 마세요)
- `PaymentMethod`, `Attendance`, `Role` 등 도메인 타입이 명확하지 않으면 물어보세요
- RLS 정책이 현재 쿼리를 지원하는지 불명확하면 질문하세요

### 2. Simplicity First

**문제를 해결하는 최소한의 코드. 추측적인 것은 없습니다.**

* 요청한 것 이상의 기능은 없습니다.
* 단일 사용 코드에 대한 추상화는 없습니다.
* 요청하지 않은 "유연성" 또는 "구성 가능성"은 없습니다.
* 불가능한 시나리오에 대한 오류 처리는 없습니다.
* 200줄을 작성하고 50줄이 가능하면, 다시 작성하세요.

자문하세요: "선배 엔지니어가 이것을 과도하게 복잡하다고 말할까?" 그렇다면, 단순화하세요.

**이 프로젝트 관련:**
- 신규 전역 상태를 Zustand에 추가하기 전에 TanStack Query로 해결 가능한지 검토하세요
- "만약을 위한" 인증 로직이나 RLS 검사를 추가하지 마세요
- UI 컴포넌트는 필요한 것만 - 미래의 "확장성"을 위해 설정하지 마세요

### 3. Surgical Changes

**꼭 필요한 것만 건드리세요. 자신의 엉망만 정리하세요.**

기존 코드를 편집할 때:

* 인접한 코드, 주석 또는 형식을 "개선"하지 마세요.
* 깨지지 않은 것을 리팩토링하지 마세요.
* 다르게 할 수 있어도 기존 스타일과 일치하세요.
* 관련 없는 죽은 코드를 발견하면, 언급하세요 - 삭제하지 마세요.

변경으로 인해 고아가 될 때:

* YOUR 변경으로 인해 사용되지 않게 된 임포트/변수/함수를 제거하세요.
* 사전 존재하던 죽은 코드는 요청하지 않는 한 제거하지 마세요.

**테스트:** 변경된 모든 라인이 사용자의 요청으로 직접 추적되어야 합니다.

**이 프로젝트 관련:**
- 타입 정의를 추가할 때 기존 명명 규칙(예: `PaymentMethod`)을 따르세요
- 기존 컴포넌트의 Tailwind 클래스를 임의로 재정렬하지 마세요
- RLS 정책은 건드리지 마세요 (명시적으로 요청받지 않으면)

### 4. Goal-Driven Execution

**성공 기준을 정의하세요. 검증될 때까지 루프하세요.**

작업을 검증 가능한 목표로 변환하세요:

* "유효성 검사 추가" → "잘못된 입력에 대한 테스트를 작성하고, 통과하게 만듭니다"
* "버그 수정" → "재현하는 테스트를 작성하고, 통과하게 만듭니다"
* "X 리팩토링" → "전후로 테스트가 통과하는지 확인합니다"

다단계 작업의 경우, 간단한 계획을 명시하세요:

```
1. [Step] → 검증: [check]
2. [Step] → 검증: [check]
3. [Step] → 검증: [check]
```

강한 성공 기준은 독립적인 루핑을 가능하게 합니다. 약한 기준("작동하게 만들기")은 지속적인 명확화가 필요합니다.

**이 프로젝트 관련:**
- "선생님 기록 저장" → "기록이 DB에 저장되고, 조회 시 나타나는지 확인"
- "권한 검사" → "director만 대시보드에 접근 가능한지, teacher는 거부되는지 확인"

---

## 📋 기술 스택

- **React 19** + **TypeScript** (strict)
- **Vite 8** + **Tailwind CSS v4**
- **Supabase** — 인증(Auth JWT) + DB
- **Zustand** — 클라이언트 전역 상태 (인증)
- **TanStack Query v5** — 서버 상태 / 데이터 페칭
- **React Router v7** — 라우팅

## 📁 프로젝트 구조

```
src/
├── pages/
│   ├── auth/          # 로그인
│   ├── teacher/       # 선생님 화면 (일일입력, 월별조회, 보강관리)
│   └── director/      # 대표 화면 (대시보드, 일별/월별, 계정관리)
├── components/ui/     # 공통 UI 컴포넌트
├── store/auth.ts      # Zustand 인증 스토어
├── lib/supabase.ts    # Supabase 클라이언트
├── types/index.ts     # 공유 타입 정의
├── constants/         # 상수
└── hooks/             # 커스텀 훅
```

## 🔧 핵심 도메인 타입

```typescript
Role = 'director' | 'teacher'
Attendance = 'present' | 'absent' | 'makeup'
PaymentMethod = 'education' | 'sports_voucher' | 'after_school' | 'card' | 'cash'
MakeupStatus = 'pending' | 'completed'
```

주요 엔티티: `User`, `Record`, `MakeupSession`, `FeeTable`, `Branch`

## 🔐 역할별 접근 제어

- `RequireAuth` — 로그인 필요 (teacher/director 공통)
- `RequireDirector` — director 역할 전용
- 미로그인 → `/login`, 권한 없음 → 역할에 맞는 대시보드로 리다이렉트

## 📐 코딩 규약

### 파일/컴포넌트
- **파일명:** PascalCase (`DailyInputPage.tsx`)
- **컴포넌트:** named export + default export 둘 다 가능
- **경로 별칭:** `@/` = `src/` (vite.config.ts 설정됨)

### 상태 관리
- **인증 상태:** Zustand (`useAuthStore`)
- **서버 데이터:** TanStack Query (`useQuery`, `useMutation`)
- **로컬 UI 상태:** `useState` / `useReducer`
- ⚠️ Zustand 스토어를 서버 데이터 캐시로 쓰지 말 것

### Supabase
- **클라이언트:** `@/lib/supabase` 에서 import
- **인증:** Supabase Auth JWT (세션은 `onAuthStateChange`로 감지)
- **DB 쿼리:** 항상 RLS 정책 고려
- **환경 변수:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### TypeScript
- ⚠️ `any` 사용 금지 — 정확한 타입 또는 `unknown` 사용
- 새 타입은 `src/types/index.ts`에 추가
- 컴포넌트 props는 인라인 타입 또는 별도 `interface`

### 스타일
- **Tailwind CSS v4** 클래스만 사용
- 인라인 스타일(`style={}`) 지양
- 반응형: 모바일 퍼스트 (`sm:`, `md:` 순)

## ⛔ 금지 사항

- ⚠️ `console.log` 프로덕션 코드에 남기지 말 것
- ⚠️ Supabase anon key를 코드에 하드코딩 금지
- ⚠️ `Record` 타입명 혼동 — 도메인 타입 `Record`와 JS 내장 `Record<K,V>` 구분하기
- ⚠️ 신규 전역 상태를 Zustand에 추가하기 전에 TanStack Query로 해결 가능한지 검토
- ⚠️ 관련 없는 죽은 코드 자동 삭제 금지

## 🚀 개발 명령어

```bash
npm run dev      # 개발 서버 (Vite)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run preview  # 빌드 결과물 미리보기
```

## 📌 주요 참고 사항

- 이 앱은 **PWA**로 설정되어 있음 (`vite-plugin-pwa`)
- 치료 기록은 민감한 개인정보 — 데이터 처리 시 주의
- 지점(branch)별로 데이터가 분리됨 (`branch_id` 필수)

---

**이 가이드가 작동하는 지표:** 불필요한 변경이 적은 diff, 과도한 복잡성으로 인한 재작성이 적으며, 명확화 질문이 구현 이후가 아닌 이전에 나타납니다.
