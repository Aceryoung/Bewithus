# CLAUDE.md — bewithus-emr

비위더스 치료 센터의 EMR(전자의무기록) 시스템. 선생님과 대표(원장)의 두 역할로 구분된 진료 기록 관리 앱.

## 기술 스택

- **React 19** + **TypeScript** (strict)
- **Vite 8** + **Tailwind CSS v4**
- **Supabase** — 인증(Auth JWT) + DB
- **Zustand** — 클라이언트 전역 상태 (인증)
- **TanStack Query v5** — 서버 상태 / 데이터 페칭
- **React Router v7** — 라우팅

## 프로젝트 구조

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

## 핵심 도메인 타입

```typescript
Role = 'director' | 'teacher'
Attendance = 'present' | 'absent' | 'makeup'
PaymentMethod = 'education' | 'sports_voucher' | 'after_school' | 'card' | 'cash'
MakeupStatus = 'pending' | 'completed'
```

주요 엔티티: `User`, `Record`, `MakeupSession`, `FeeTable`, `Branch`

## 역할별 접근 제어

- `RequireAuth` — 로그인 필요 (teacher/director 공통)
- `RequireDirector` — director 역할 전용
- 미로그인 → `/login`, 권한 없음 → 역할에 맞는 대시보드로 리다이렉트

## 코딩 규약

### 파일/컴포넌트
- 파일명: PascalCase (`DailyInputPage.tsx`)
- 컴포넌트: named export + default export 둘 다 가능
- 경로 별칭: `@/` = `src/` (vite.config.ts 설정됨)

### 상태 관리
- **인증 상태**: Zustand (`useAuthStore`)
- **서버 데이터**: TanStack Query (`useQuery`, `useMutation`)
- **로컬 UI 상태**: `useState` / `useReducer`
- Zustand 스토어를 서버 데이터 캐시로 쓰지 말 것

### Supabase
- 클라이언트: `@/lib/supabase` 에서 import
- 인증: Supabase Auth JWT (세션은 `onAuthStateChange`로 감지)
- DB 쿼리 시 항상 RLS 정책 고려할 것
- `.env` 변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### TypeScript
- `any` 사용 금지 — 정확한 타입 또는 `unknown` 사용
- 새 타입은 `src/types/index.ts`에 추가
- 컴포넌트 props는 인라인 타입 또는 별도 `interface`

### 스타일
- Tailwind CSS v4 클래스만 사용
- 인라인 스타일(`style={}`) 지양
- 반응형: 모바일 퍼스트 (`sm:`, `md:` 순)

## 금지 사항

- `console.log` 프로덕션 코드에 남기지 말 것
- Supabase anon key를 코드에 하드코딩 금지
- `Record` 타입명은 이미 도메인 타입으로 사용 중 — JS 내장 `Record<K,V>`와 혼동 주의
- 신규 전역 상태를 Zustand에 추가하기 전에 TanStack Query로 해결 가능한지 먼저 검토

## 개발 명령어

```bash
npm run dev      # 개발 서버 (Vite)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run preview  # 빌드 결과물 미리보기
```

## 주요 참고 사항

- 이 앱은 **PWA**로 설정되어 있음 (`vite-plugin-pwa`)
- 치료 기록은 민감한 개인정보 — 데이터 처리 시 주의
- 지점(branch)별로 데이터가 분리됨 (`branch_id` 필수)
