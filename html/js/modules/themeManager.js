// 主题管理模块
import { I18n, Notification } from './core/index.js';

export const ThemeManager = {
    /**
     * 创建主题设置项
     * @returns {Array} - 设置项配置数组
     */
    createSettingsItems() {
        return [
            {
                id: 'theme',
                label: I18n.getMessage('settingsTheme', '主题模式'),
                type: 'radio',
                options: [
                    { value: 'auto', label: I18n.getMessage('themeAuto', '跟随系统') },
                    { value: 'light', label: I18n.getMessage('themeLight', '浅色模式') },
                    { value: 'dark', label: I18n.getMessage('themeDark', '深色模式') }
                ],
                getValue: () => localStorage.getItem('theme') || 'auto',
                description: I18n.getMessage('settingsThemeDesc', '选择应用的主题外观'),
                onChange: (value) => {
                    this.handleThemeChange(value);
                }
            }
        ];
    },

    /**
     * 处理主题变化
     * @param {string} theme - 主题值 ('auto', 'light', 'dark')
     */
    handleThemeChange(theme) {
        try {
            localStorage.setItem('theme', theme);
            this.applyTheme(theme);
            
            const themeNames = {
                'auto': I18n.getMessage('themeAuto', '跟随系统'),
                'light': I18n.getMessage('themeLight', '浅色模式'),
                'dark': I18n.getMessage('themeDark', '深色模式')
            };
            
            Notification.notify({
                title: I18n.getMessage('themeChanged', '主题已更改'),
                message: `${I18n.getMessage('currentTheme', '当前主题')}: ${themeNames[theme]}`,
                type: 'success',
                duration: 2000
            });
        } catch (error) {
            console.error('主题更改失败:', error);
            Notification.notify({
                title: I18n.getMessage('error', '错误'),
                message: I18n.getMessage('themeChangeFailed', '主题更改失败'),
                type: 'error',
                duration: 3000
            });
        }
    },    /**
     * 应用主题
     * @param {string} theme - 主题值
     */
    applyTheme(theme) {
        const root = document.documentElement;
        
        // 如果是自动模式，检测系统主题
        if (theme === 'auto') {
            this.detectSystemTheme();
        } else {
            // 直接设置指定的主题
            root.setAttribute('data-theme', theme);
        }
        
        console.log(`主题已应用: ${theme}`);
    },    /**
     * 检测系统主题
     */
    detectSystemTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        const root = document.documentElement;
        
        const updateTheme = (e) => {
            if (localStorage.getItem('theme') === 'auto') {
                root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        };
        
        // 初始设置
        updateTheme(prefersDark);
        
        // 移除之前的监听器（如果存在）
        if (this._systemThemeListener) {
            prefersDark.removeEventListener('change', this._systemThemeListener);
        }
        
        // 保存监听器引用以便后续移除
        this._systemThemeListener = updateTheme;
        
        // 监听系统主题变化
        prefersDark.addEventListener('change', this._systemThemeListener);
    },    /**
     * 初始化主题
     */
    init() {
        // 由于主题初始化已经在 newtab.js 中完成，这里不需要重复初始化
        // 但我们需要确保监听器正确设置
        const savedTheme = localStorage.getItem('theme') || 'auto';
        if (savedTheme === 'auto') {
            this.detectSystemTheme();
        }
    },

    /**
     * 获取当前主题
     * @returns {string} - 当前主题值
     */
    getCurrentTheme() {
        return localStorage.getItem('theme') || 'auto';
    },

    /**
     * 获取实际显示的主题（考虑系统主题）
     * @returns {string} - 实际主题值 ('light' | 'dark')
     */
    getActualTheme() {
        const theme = this.getCurrentTheme();
        
        if (theme === 'auto') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        
        return theme;
    }
};
