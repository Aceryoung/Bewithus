import { useNavigate } from 'react-router-dom'
import { SearchContext } from '@/context/SearchContext'

export default function SearchProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <SearchContext.Provider value={{ openSearch: () => navigate('/search') }}>
      {children}
    </SearchContext.Provider>
  )
}
