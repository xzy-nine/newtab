import { useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppSettings } from '@/lib/app-settings-store'
import { getMessage } from '@/lib/i18n'

export function SearchBox() {
  const [query, setQuery] = useState('')
  const { searchEngines, currentEngineIndex, setCurrentEngineIndex } = useAppSettings()

  const currentEngine = searchEngines[currentEngineIndex] || searchEngines[0]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      const searchUrl = currentEngine.url + encodeURIComponent(query.trim())
      window.open(searchUrl, '_blank')
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSearch} className="flex items-center gap-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg border border-gray-200 p-2">
        <Select value={String(currentEngineIndex)} onValueChange={(v) => setCurrentEngineIndex(Number(v))}>
          <SelectTrigger className="w-24 h-10 border-none bg-transparent hover:bg-gray-100 rounded-full">
            <img 
              src={`${new URL(currentEngine.url).origin}/favicon.ico`}
              alt={currentEngine.name}
              className="w-5 h-5 mr-2 object-contain"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>'
              }}
            />
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </SelectTrigger>
          <SelectContent className="w-48">
            {searchEngines.map((engine, index) => (
              <SelectItem key={engine.name} value={String(index)}>
                <img 
                  src={`${new URL(engine.url).origin}/favicon.ico`}
                  alt={engine.name}
                  className="w-4 h-4 mr-2 object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src = ''
                  }}
                />
                {engine.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <div className="flex-1 flex items-center">
          <Search className="w-5 h-5 text-gray-400 ml-2" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={getMessage('searchPlaceholder', 'Search...')}
            className="flex-1 border-none bg-transparent shadow-none px-2 focus-visible:ring-0"
          />
        </div>
        
        <Button type="submit" className="rounded-full bg-blue-500 hover:bg-blue-600">
          {getMessage('searchPlaceholder', 'Search')}
        </Button>
      </form>
    </div>
  )
}
