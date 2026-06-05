# DESIGN.md — 비위더스 SRA

AI 코딩 에이전트를 위한 디자인 시스템 문서.
새 UI를 구현할 때 이 파일의 토큰과 패턴을 우선 따른다.

---

## 브랜드 정체성

- **서비스명:** 비위더스 SRA
- **성격:** 치료 센터용 EMR — 신뢰감, 깔끔함, 모바일 친화성
- **톤:** 전문적이나 딱딱하지 않음. 한국어 UI, 간결한 레이블

---

## 색상 토큰

### Primary — Cyan Blue
```
Primary:        #00b4d8   (주 버튼, 활성 탭, 아이콘, 강조 수치)
Primary Light:  #e8f7fb   (primary 버튼 배경 연하게, 활성 탭 배경)
Primary Hover:  #d0eff7   (active:bg, 눌림 상태)
Primary Dark:   #0096b8   (primary 버튼 눌림)
Primary Darker: #007a93   (드물게 사용)
```

### Secondary — Green
```
Green:          #7db83a   (실시간 뱃지, 엑셀 다운로드 버튼, 긍정 강조)
Green Light:    #f0f9e8   (green 배경 연하게)
Green Dark:     #5f9428   (green 버튼 눌림)
```

### Accent — Pink
```
Pink:           #e85b8a   (보조 강조, 특정 지원금 뱃지)
Pink Light:     #fde8f0
```

### Semantic
```
Error / 결석:   red-400 / red-500   (text-red-400, bg-red-50)
Success / 완료: emerald-600         (text-emerald-600, bg-emerald-50)
출석:           #00b4d8 (primary)
보강:           purple-600 / purple-50
```

### Neutral
```
Page BG:        #f7f8fc  (bg-[#f7f8fc]) — 모든 페이지 배경
Card BG:        white
Border:         gray-100 (주), gray-200 (인풋)
Text Strong:    gray-900
Text Default:   gray-700
Text Sub:       gray-500
Text Muted:     gray-400
Text Disabled:  gray-300
```

---

## 타이포그래피

```
제목 (페이지):   text-2xl font-bold text-gray-900
섹션 헤더:       text-base font-bold text-gray-900
카드 제목:       text-sm font-semibold text-gray-900
본문:            text-sm text-gray-700
보조 텍스트:     text-xs text-gray-500
설명 / 메타:     text-xs text-gray-400
수치 강조:       text-base font-bold text-[#00b4d8]
금액:            text-sm font-semibold text-gray-900
레이블 (뱃지):   text-[10px] font-medium
```

---

## 간격 & 레이아웃

```
페이지 패딩:     px-4 (모바일), px-5 (대시보드 헤더)
섹션 간격:       space-y-4
카드 내부 패딩:  p-4
리스트 아이템:   py-2 border-b border-gray-50 last:border-0
최대 너비:       md:max-w-3xl md:mx-auto md:w-full (콘텐츠 영역)
사이드바 폭:     220px (lg 이상)
바텀 네비 높이:  ~56px + safe-area-inset-bottom
```

---

## 모서리 (Border Radius)

```
카드 / 시트:     rounded-2xl  (주력)
버튼 / 인풋:     rounded-xl   (중형)
소형 버튼:       rounded-lg
뱃지 / 태그:     rounded-full
인라인 태그:     rounded (2px)
```

---

## 그림자

```
카드:            shadow-sm  + border border-gray-100
모달 / 시트:     shadow-xl
바텀 시트:       shadow-[0_-4px_24px_rgba(0,0,0,0.08)]
```

---

## 컴포넌트 패턴

### 버튼

**Primary (채움)**
```tsx
className="bg-[#00b4d8] text-white text-sm font-semibold px-4 py-3 rounded-xl
           active:bg-[#0096b8] disabled:opacity-40 transition-colors"
```

**Primary (연하게) — 가장 자주 쓰임**
```tsx
className="text-[#00b4d8] bg-[#e8f7fb] text-xs font-medium px-3 py-1.5 rounded-lg
           active:bg-[#d0eff7] transition-colors"
```

**Neutral (회색)**
```tsx
className="text-gray-600 bg-gray-100 text-xs px-3 py-1.5 rounded-full
           active:bg-gray-200 transition-colors"
```

**Green (엑셀 다운로드 등)**
```tsx
className="bg-[#7db83a] text-white text-sm font-semibold px-3 py-3 rounded-xl
           active:bg-[#5f9428] disabled:opacity-40 transition-colors"
```

**아이콘 버튼 (원형)**
```tsx
className="w-8 h-8 flex items-center justify-center text-[#00b4d8] rounded-lg
           active:bg-gray-100"
```

### 카드
```tsx
className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
```

카드 헤더 (배경 있음):
```tsx
className="px-4 py-3 bg-gray-50 border-b border-gray-100"
```

### 인풋
```tsx
className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3
           text-sm text-gray-900 outline-none focus:border-[#00b4d8] transition-colors
           placeholder:text-gray-400"
```

인라인 인풋 (테두리 없음):
```tsx
className="flex-1 text-sm outline-none text-gray-900 placeholder:text-gray-400 bg-transparent"
```

### 뱃지 / 태그

출석 상태별:
```tsx
// 출석
className="bg-[#e8f7fb] text-[#00b4d8] px-1.5 py-0.5 rounded text-[10px] font-medium"
// 보강
className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded text-[10px] font-medium"
// 결석
className="bg-red-50 text-red-500 px-1.5 py-0.5 rounded text-[10px] font-medium"
// 결제
className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px] font-medium"
```

알림 카운트:
```tsx
className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold
           rounded-full flex items-center justify-center px-1"
```

### 탭 (수평)
```tsx
// 컨테이너
className="flex bg-white border-b border-gray-100 px-4 pt-2"
// 탭 아이템
className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2
  ${isActive ? 'text-[#00b4d8] border-[#00b4d8]' : 'text-gray-400 border-transparent'}`}
```

### 필터 칩 (가로 스크롤)
```tsx
// 활성
className="px-4 py-2 rounded-full text-sm font-medium bg-[#00b4d8] text-white shrink-0"
// 비활성
className="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-600 shrink-0"
```

### 네비게이션 아이템 (사이드바)
```tsx
className={({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
   ${isActive ? 'bg-[#e8f7fb] text-[#00b4d8]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`
}
```

### 로딩 스피너
```tsx
className="w-6 h-6 rounded-full border-2 border-[#00b4d8] border-t-transparent animate-spin"
```

### 섹션 레이블
```tsx
className="text-xs font-semibold text-gray-400 mb-2"
```

---

## 아이콘 규격

SVG 인라인 방식. Heroicons 스타일 stroke 기반.

```
네비게이션 아이콘:  18×18, strokeWidth 1.6
페이지 헤더 아이콘: 20×20, strokeWidth 1.8
소형 아이콘:        12×12, strokeWidth 1.2~1.4
```

현재 사용 중인 아이콘: Home, CreditCard, Calendar, Clipboard, Users, Message, Search

---

## 반응형 전략

- **모바일 퍼스트** — 기본 스타일이 모바일
- **브레이크포인트:** `lg` (1024px) 기준 단일 분기
- 모바일: 바텀 네비 + PageHeader (sticky top-0)
- 데스크탑: 사이드바 (w-[220px] fixed) + DesktopTopBar (h-14 sticky)
- 콘텐츠 오프셋: `lg:ml-[220px]` (index.css 전역 적용)
- 모바일 전용: `lg:hidden`, 데스크탑 전용: `hidden lg:flex`

---

## 페이지 구조 템플릿

### 모바일 포함 일반 페이지
```tsx
<div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
  <PageHeader title="페이지 제목" />
  <div className="flex-1 px-4 py-4 space-y-4 pb-24 md:max-w-3xl md:mx-auto md:w-full">
    {/* 콘텐츠 */}
  </div>
  <BottomNav />
</div>
```

### 카드 리스트 패턴
```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
    {/* 헤더 */}
  </div>
  <div className="divide-y divide-gray-50">
    {items.map(item => (
      <div key={item.id} className="px-4 py-3 flex items-center justify-between">
        {/* 아이템 */}
      </div>
    ))}
  </div>
</div>
```

---

## 금지 사항

- `style={}` 인라인 스타일 사용 금지 (Tailwind 클래스로 대체)
- `text-blue-*`, `text-cyan-*` 등 기본 Tailwind 색상으로 브랜드 색상 대체 금지 — 반드시 `#00b4d8` 사용
- 새로운 색상 임의 도입 금지 — 위 토큰 범위 내에서 사용
- `rounded-3xl` 이상 사용 금지
- `shadow-md`, `shadow-lg` 남용 금지 — 카드는 `shadow-sm`이 기본
