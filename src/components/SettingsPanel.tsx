import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox, CheckboxIndicator } from '@/components/ui/checkbox'
import { useAppSettings } from '@/lib/app-settings-store'
import { getMessage } from '@/lib/i18n'

export function SettingsPanel() {
  const {
    theme,
    setTheme,
    showBookmarks,
    setShowBookmarks,
    showClock,
    setShowClock,
    showWidgets,
    setShowWidgets,
    backgroundEnabled,
    setBackgroundEnabled,
  } = useAppSettings()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="fixed top-4 right-4 z-50 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="text-center mb-4">
          <DialogTitle>{getMessage('settingsTitle', 'Settings')}</DialogTitle>
        </div>
        
        <div className="space-y-6 mt-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {getMessage('settingsGeneral', 'General')}
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">主题模式</p>
                  <p className="text-xs text-gray-500">选择外观主题</p>
                </div>
                <Select value={theme} onValueChange={(v) => setTheme(v as 'system' | 'light' | 'dark')}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">系统</SelectItem>
                    <SelectItem value="light">浅色</SelectItem>
                    <SelectItem value="dark">深色</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">显示书签</p>
                  <p className="text-xs text-gray-500">在新标签页显示书签文件夹</p>
                </div>
                <Checkbox checked={showBookmarks} onCheckedChange={(v) => setShowBookmarks(v as boolean)}>
                  <CheckboxIndicator />
                </Checkbox>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">显示时钟</p>
                  <p className="text-xs text-gray-500">在新标签页显示时间和日期</p>
                </div>
                <Checkbox checked={showClock} onCheckedChange={(v) => setShowClock(v as boolean)}>
                  <CheckboxIndicator />
                </Checkbox>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">显示小部件</p>
                  <p className="text-xs text-gray-500">在新标签页显示小部件区域</p>
                </div>
                <Checkbox checked={showWidgets} onCheckedChange={(v) => setShowWidgets(v as boolean)}>
                  <CheckboxIndicator />
                </Checkbox>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">背景图片</p>
                  <p className="text-xs text-gray-500">使用 Bing 每日壁纸作为背景</p>
                </div>
                <Checkbox checked={backgroundEnabled} onCheckedChange={(v) => setBackgroundEnabled(v as boolean)}>
                  <CheckboxIndicator />
                </Checkbox>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {getMessage('settingsAbout', 'About')}
            </h3>
            <div className="text-xs text-gray-500">
              <p>{getMessage('settingsVersion', 'Version')}: {browser.runtime.getManifest().version}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
