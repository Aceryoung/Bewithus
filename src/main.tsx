import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Buffer } from 'buffer'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// 새 버전 배포 시 자동 페이지 새로고침 (구버전 캐시 제거)
registerSW({ onNeedRefresh() { window.location.reload() } })

// exceljs 브라우저 호환을 위한 Buffer 폴리필
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).Buffer = Buffer
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,       // 3분간 신선 → 탭 전환 시 불필요한 재요청 방지
      gcTime: 1000 * 60 * 10,          // 10분간 캐시 유지
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000), // 2초 → 4초
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
