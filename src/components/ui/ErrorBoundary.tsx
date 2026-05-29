import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    // 새 배포 후 청크 해시 불일치 → 강제 리로드로 새 서비스워커 적용
    if (
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed') ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Loading CSS chunk')
    ) {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center min-h-dvh bg-slate-50 px-6 text-center">
          <p className="text-slate-400 text-sm mb-4">오류가 발생했습니다.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-sm text-[#00b4d8] bg-[#e8f7fb] px-4 py-2 rounded-xl active:bg-[#d0eff7] transition-colors"
          >
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
