import { Menu } from './menu.js';
import { Utils } from './utils.js';
import { I18n } from './i18n.js';
import { SearchEngineAPI } from './searchEngine.js';
import { Notification } from './notification.js';
import { IconManager } from './iconManager.js';
import { GridSystem } from './gridSystem.js';
import { AI } from './ai.js';

export const Settings = {
  // 设置配置 - 改为函数以支持动态翻译
  getCategories: () => [
    {
      id: 'general',
      icon: '⚙️',
      title: I18n.getMessage('settingsGeneral', '常规设置'),
      items: [
        {
          id: 'language',
          label: I18n.getMessage('settingsLanguage', '界面语言'),
          type: 'select',
          options: [
            { value: 'zh', label: '简体中文' },
            { value: 'en', label: 'English' }
          ],
          getValue: () => I18n.getCurrentLanguage(),
          description: I18n.getMessage('settingsLanguageDesc', '选择界面显示语言')
        },
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
          description: I18n.getMessage('settingsThemeDesc', '选择应用的主题外观')
        }
      ]
    },
    {
      id: 'grid-system',
      icon: '📐',
      title: I18n.getMessage('settingsGridSystem', '网格系统'),
      items: [
        {
          id: 'grid-enabled',
          label: I18n.getMessage('settingsGridEnabled', '启用网格系统'),
          type: 'checkbox',
          getValue: () => GridSystem.gridEnabled,
          description: I18n.getMessage('settingsGridEnabledDesc', '启用后元素将自动吸附到网格位置')
        },
        {
          id: 'grid-debug',
          label: I18n.getMessage('settingsGridDebug', '显示网格线'),
          type: 'checkbox',
          getValue: () => GridSystem.isDebugMode,
          description: I18n.getMessage('settingsGridDebugDesc', '显示网格辅助线，帮助对齐元素')
        },
        {
          id: 'grid-snap-threshold',
          label: I18n.getMessage('settingsGridSnapThreshold', '吸附阈值'),
          type: 'range',
          min: 5,
          max: 30,
          step: 1,
          getValue: () => GridSystem.snapThreshold,
          unit: 'px',
          description: I18n.getMessage('settingsGridSnapThresholdDesc', '元素吸附到网格的距离阈值')
        }
      ]
    },
    {
      id: 'ai-assistant',
      icon: '🤖',
      title: I18n.getMessage('settingsAI', 'AI助手'),
      items: [
        {
          id: 'ai-enabled',
          label: I18n.getMessage('settingsAIEnabled', '启用AI助手'),
          type: 'checkbox',
          getValue: () => AI.getConfig().enabled,
          description: I18n.getMessage('settingsAIEnabledDesc', '启用后可在搜索框旁显示AI按钮')
        },
        {
          id: 'ai-provider-list',
          label: I18n.getMessage('settingsAIProviders', 'AI供应商管理'),
          type: 'custom',
          description: I18n.getMessage('settingsAIProvidersDesc', '管理和配置AI供应商')
        },
        {
          id: 'add-ai-provider',
          label: I18n.getMessage('settingsAddAIProvider', '添加AI供应商'),
          type: 'button',
          buttonText: I18n.getMessage('addCustomAIProvider', '添加自定义AI供应商'),
          buttonClass: 'btn-primary',
          description: I18n.getMessage('settingsAddAIProviderDesc', '添加新的AI供应商配置')
        },
        {
          id: 'ai-system-prompt',
          label: I18n.getMessage('settingsAISystemPrompt', '系统提示词'),
          type: 'textarea',
          getValue: () => AI.getConfig().systemPrompt,
          description: I18n.getMessage('settingsAISystemPromptDesc', '定义AI的行为和回答风格')
        },
        {
          id: 'ai-quick-prompts',
          label: I18n.getMessage('settingsAIQuickPrompts', '快速提示词'),
          type: 'custom',
          description: I18n.getMessage('settingsAIQuickPromptsDesc', '管理快速提示词，用逗号分隔')
        }
      ]
    },
    {
      id: 'search-engines',
      icon: '🔍',
      title: I18n.getMessage('settingsSearchEngines', '搜索引擎'),
      items: [
        {
          id: 'search-engine-list',
          label: I18n.getMessage('settingsSearchEngineList', '搜索引擎管理'),
          type: 'custom',
          description: I18n.getMessage('settingsSearchEngineListDesc', '管理和配置搜索引擎')
        },
        {
          id: 'add-search-engine',
          label: I18n.getMessage('settingsAddSearchEngine', '添加搜索引擎'),
          type: 'button',
          buttonText: I18n.getMessage('addCustomSearchEngine', '添加自定义搜索引擎'),
          buttonClass: 'btn-primary',
          description: I18n.getMessage('settingsAddSearchEngineDesc', '添加新的自定义搜索引擎')
        }
      ]
    },
    {
      id: 'data-sync',
      icon: '☁️',
      title: I18n.getMessage('settingsDataSync', '数据同步'),
      items: [
        {
          id: 'sync-mode',
          label: I18n.getMessage('settingsSyncMode', '同步模式'),
          type: 'radio',
          options: [
            { value: 'disabled', label: I18n.getMessage('syncModeDisabled', '关闭同步') },
            { value: 'upload', label: I18n.getMessage('syncModeUpload', '上传到云端') },
            { value: 'download', label: I18n.getMessage('syncModeDownload', '从云端下载') }
          ],
          getValue: () => localStorage.getItem('sync-mode') || 'disabled',
          description: I18n.getMessage('settingsSyncModeDesc', '选择数据同步方式，避免冲突的单向同步')
        },
        {
          id: 'sync-status',
          label: I18n.getMessage('settingsSyncStatus', '同步状态'),
          type: 'custom',
          description: I18n.getMessage('settingsSyncStatusDesc', '显示当前同步状态和最后同步时间')
        },
        {
          id: 'sync-actions',
          label: I18n.getMessage('settingsSyncActions', '手动同步'),
          type: 'custom',
          description: I18n.getMessage('settingsSyncActionsDesc', '手动执行同步操作')
        },
        {
          id: 'sync-interval',
          label: I18n.getMessage('settingsSyncInterval', '自动同步间隔'),
          type: 'select',
          options: [
            { value: '0', label: I18n.getMessage('syncIntervalDisabled', '关闭自动同步') },
            { value: '300', label: I18n.getMessage('syncInterval5min', '5分钟') },
            { value: '600', label: I18n.getMessage('syncInterval10min', '10分钟') },
            { value: '1800', label: I18n.getMessage('syncInterval30min', '30分钟') },
            { value: '3600', label: I18n.getMessage('syncInterval1hour', '1小时') }
          ],
          getValue: () => localStorage.getItem('sync-interval') || '0',
          description: I18n.getMessage('settingsSyncIntervalDesc', '设置自动同步的时间间隔')
        }
      ]
    }
  ],

  currentCategory: 'general',

  open: () => {
    Settings.showSettingsModal();
  },

  showSettingsModal: () => {
    const modalId = 'settings-modal';
    
    // 删除旧的模态框
    const oldModal = document.getElementById(modalId);
    if (oldModal) {
      oldModal.remove();
    }

    // 创建模态框
    const modal = Utils.createElement('div', 'modal settings-modal', { id: modalId });
    const modalContent = Utils.createElement('div', 'modal-content settings-content');
    
    // 模态框头部
    const modalHeader = Utils.createElement('div', 'modal-header');
    const closeBtn = Utils.createElement('span', 'modal-close', {}, '&times;');
    const title = Utils.createElement('h2', '', {}, I18n.getMessage('settingsTitle', '设置'));
    modalHeader.append(title, closeBtn);
    
    // 设置主体
    const settingsBody = Utils.createElement('div', 'settings-body');
    
    // 左侧分类
    const sidebar = Utils.createElement('div', 'settings-sidebar');
    const categories = Settings.getCategories();
    categories.forEach(category => {
      const categoryItem = Utils.createElement('div', 
        `settings-category ${category.id === Settings.currentCategory ? 'active' : ''}`,
        { 'data-category': category.id }
      );
      
      const icon = Utils.createElement('span', 'category-icon', {}, category.icon);
      const text = Utils.createElement('span', 'category-text', {}, category.title);
      
      categoryItem.append(icon, text);
      sidebar.appendChild(categoryItem);
    });
    
    // 右侧详情
    const content = Utils.createElement('div', 'settings-content-area');
    
    settingsBody.append(sidebar, content);
    modalContent.append(modalHeader, settingsBody);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // 渲染当前分类内容
    Settings.renderCategoryContent(Settings.currentCategory);
    
    // 绑定事件
    Settings.bindEvents(modalId);
    
    // 显示模态框后同步设置
    setTimeout(() => {
      Settings.syncSettingsWithSystem();
    }, 100);
    
    // 监听外部设置变化
    const syncHandler = () => Settings.syncSettingsWithSystem();
    window.addEventListener('gridSettingsChanged', syncHandler);
    
    // 模态框关闭时移除监听器
    const settingsModal = document.getElementById(modalId); // 重命名变量避免冲突
    const originalHide = Menu.Modal.hide;
    Menu.Modal.hide = function(id) {
      if (id === modalId) {
        window.removeEventListener('gridSettingsChanged', syncHandler);
        Menu.Modal.hide = originalHide; // 恢复原方法
      }
      return originalHide.call(this, id);
    };
    
    // 显示模态框
    Menu.Modal.show(modalId);
  },

  renderCategoryContent: async (categoryId) => {
    const categories = Settings.getCategories();
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return;
    
    const contentArea = document.querySelector('.settings-content-area');
    if (!contentArea) return;
    
    // 清空内容
    contentArea.innerHTML = '';
    
    // 分类标题
    const categoryTitle = Utils.createElement('h3', 'category-title', {}, category.title);
    contentArea.appendChild(categoryTitle);
    
    // 设置项容器
    const itemsContainer = Utils.createElement('div', 'settings-items');
    
    for (const item of category.items) {
      const itemElement = await Settings.createSettingItem(item);
      itemsContainer.appendChild(itemElement);
    }
    
    contentArea.appendChild(itemsContainer);
    
    // 移除 setTimeout，不再需要异步同步
  },

  createSettingItem: async (item) => {
    const itemElement = Utils.createElement('div', 'setting-item');
    
    // 设置项头部
    const itemHeader = Utils.createElement('div', 'setting-item-header');
    const label = Utils.createElement('label', 'setting-label', { for: item.id }, item.label);
    const description = Utils.createElement('div', 'setting-description', {}, item.description || '');
    itemHeader.append(label, description);
    
    // 设置项控件
    const itemControl = Utils.createElement('div', 'setting-control');
    
    // 动态获取当前值的函数
    const getCurrentValue = () => {
      try {
        if (typeof item.getValue === 'function') {
          return item.getValue();
        }
        
        // 为特定设置项添加动态值获取
        switch (item.id) {
          case 'grid-enabled':
            return window.GridSystem ? GridSystem.gridEnabled : false;
          case 'grid-debug':
            return window.GridSystem ? GridSystem.isDebugMode : false;
          case 'grid-snap-threshold':
            return window.GridSystem ? GridSystem.snapThreshold : 15;
          case 'ai-enabled':
            return window.AI ? AI.getConfig().enabled : false;
          case 'ai-system-prompt':
            return window.AI ? AI.getConfig().systemPrompt : '';
          case 'theme':
            return localStorage.getItem('theme') || 'auto';
          case 'language':
            return window.I18n ? I18n.getCurrentLanguage() : 'zh';
          case 'sync-mode':
            return localStorage.getItem('sync-mode') || 'disabled';
          case 'sync-interval':
            return localStorage.getItem('sync-interval') || '0';
          default:
            return item.value || item.defaultValue || '';
        }
      } catch (error) {
        console.error(`获取设置项 ${item.id} 的值时出错:`, error);
        return item.defaultValue || '';
      }
    };
    
    // 获取初始值
    let currentValue = getCurrentValue();
    console.log(`设置项 ${item.id} 当前值:`, currentValue);
    
    switch (item.type) {
      case 'checkbox':
        const isChecked = Boolean(currentValue);
        console.log(`复选框 ${item.id} 选中状态:`, isChecked);
        
        const checkbox = Utils.createElement('input', 'setting-checkbox', {
          type: 'checkbox',
          id: item.id
        });
        
        // 设置初始状态
        checkbox.checked = isChecked;
        
        const checkboxLabel = Utils.createElement('label', 'checkbox-switch', { for: item.id });
        
        // 为特定设置项添加事件监听
        if (item.id === 'grid-enabled') {
          checkbox.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            console.log('网格系统切换状态:', enabled);
            
            // 确保 GridSystem 已初始化
            if (window.GridSystem) {
              try {
                await GridSystem.toggleGridSystem(enabled);
                
                // 立即同步显示状态
                setTimeout(() => {
                  const latestValue = getCurrentValue();
                  checkbox.checked = latestValue;
                  console.log('网格系统状态同步后:', latestValue);
                }, 100);
                
                // 显示通知
                Notification.notify({
                  title: enabled 
                    ? I18n.getMessage('gridSystemEnabled', '网格系统已启用')
                    : I18n.getMessage('gridSystemDisabled', '网格系统已禁用'),
                  type: enabled ? 'success' : 'info',
                  duration: 2000
                });
              } catch (error) {
                console.error('切换网格系统失败:', error);
                // 恢复原状态
                checkbox.checked = !enabled;
              }
            } else {
              console.error('GridSystem 未初始化');
              checkbox.checked = false;
            }
          });
        } else if (item.id === 'grid-debug') {
          checkbox.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            console.log('网格调试切换状态:', enabled);
            
            if (window.GridSystem) {
              try {
                await GridSystem.toggleGridDebug(enabled);
                
                // 立即同步显示状态
                setTimeout(() => {
                  const latestValue = getCurrentValue();
                  checkbox.checked = latestValue;
                  console.log('网格调试状态同步后:', latestValue);
                }, 100);
                
                // 显示通知
                Notification.notify({
                  title: enabled
                    ? I18n.getMessage('gridDebugEnabled', '网格调试已启用')
                    : I18n.getMessage('gridDebugDisabled', '网格调试已禁用'),
                  type: 'info',
                  duration: 2000
                });
              } catch (error) {
                console.error('切换网格调试失败:', error);
                checkbox.checked = !enabled;
              }
            } else {
              console.error('GridSystem 未初始化');
              checkbox.checked = false;
            }
          });
        } else if (item.id === 'ai-enabled') {
          checkbox.addEventListener('change', (e) => {
            Settings.handleAIEnabledChange(e.target.checked);
            // 立即更新显示状态
            setTimeout(() => {
              checkbox.checked = getCurrentValue();
            }, 100);
          });
        }
        
        itemControl.append(checkbox, checkboxLabel);
        break;
        
      case 'range':
        const rangeContainer = Utils.createElement('div', 'range-container');
        const range = Utils.createElement('input', 'setting-range', {
          type: 'range',
          id: item.id,
          min: item.min,
          max: item.max,
          step: item.step,
          value: currentValue
        });
        const rangeValue = Utils.createElement('span', 'range-value', {}, `${currentValue}${item.unit || ''}`);
        rangeContainer.append(range, rangeValue);
        itemControl.appendChild(rangeContainer);
        
        // 更新显示值和实际值
        range.addEventListener('input', (e) => {
          const value = parseInt(e.target.value);
          rangeValue.textContent = `${value}${item.unit || ''}`;
          
          // 为网格吸附阈值添加实时更新
          if (item.id === 'grid-snap-threshold') {
            console.log('网格吸附阈值变更:', value);
            if (window.GridSystem) {
              try {
                GridSystem.setSnapThreshold(value);
                console.log('网格吸附阈值设置成功:', value);
              } catch (error) {
                console.error('设置网格吸附阈值失败:', error);
              }
            }
          }
        });
        
        // 监听外部变化并同步界面
        const syncRangeValue = () => {
          const latestValue = getCurrentValue();
          if (range.value !== latestValue.toString()) {
            range.value = latestValue;
            rangeValue.textContent = `${latestValue}${item.unit || ''}`;
          }
        };
        
        // 定期同步值（用于处理外部修改）
        if (item.id.startsWith('grid-')) {
          const syncInterval = setInterval(syncRangeValue, 1000);
          
          // 在设置模态框关闭时清除定时器
          const modalElement = document.querySelector('.settings-modal');
          if (modalElement) {
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                  mutation.removedNodes.forEach((node) => {
                    if (node === modalElement) {
                      clearInterval(syncInterval);
                      observer.disconnect();
                    }
                  });
                }
              });
            });
            observer.observe(document.body, { childList: true });
          }
        }
        break;
        
      case 'select':
        const select = Utils.createElement('select', 'setting-select', { id: item.id });
        item.options.forEach(option => {
          const optionElement = Utils.createElement('option', '', { value: option.value }, option.label);
          select.appendChild(optionElement);
        });
        
        // 在添加所有选项后设置选中值
        select.value = currentValue;
        
        // 为语言选择器添加事件监听
        if (item.id === 'language') {
          select.addEventListener('change', async (e) => {
            const selectedLanguage = e.target.value;
            try {
              await I18n.changeLanguage(selectedLanguage);
              
              // 显示成功通知
              Notification.notify({
                title: I18n.getMessage('success', '成功'),
                message: I18n.getMessage('languageChanged', '语言设置已更改，正在刷新页面...'),
                type: 'success',
                duration: 2000
              });
              
              // 延迟刷新页面以确保通知显示
              setTimeout(() => {
                location.reload();
              }, 1000);
            } catch (error) {
              console.error('切换语言失败:', error);
              
              // 显示错误通知
              Notification.notify({
                title: I18n.getMessage('error', '错误'),
                message: I18n.getMessage('languageChangeError', '语言设置更改失败'),
                type: 'error',
                duration: 3000
              });
              
              // 恢复到原来的选择
              select.value = I18n.getCurrentLanguage();
            }
          });
        } else if (item.id === 'theme') {
          select.addEventListener('change', (e) => {
            Settings.handleThemeChange(e.target.value);
          });
        } else if (item.id === 'sync-interval') {
          select.addEventListener('change', (e) => {
            const interval = e.target.value;
            localStorage.setItem('sync-interval', interval);
            
            // 重启自动同步
            const syncMode = localStorage.getItem('sync-mode');
            if (syncMode !== 'disabled') {
              Settings.startAutoSync();
            }
            
            Notification.notify({
              title: I18n.getMessage('syncIntervalChanged', '同步间隔已更改'),
              message: interval === '0' ? 
                I18n.getMessage('autoSyncDisabled', '自动同步已关闭') :
                I18n.getMessage('autoSyncEnabled', '自动同步已启用'),
              type: 'info',
              duration: 2000
            });
          });
        }
        
        itemControl.appendChild(select);
        break;
        
      case 'radio':
        const radioGroup = Utils.createElement('div', 'radio-group');
        item.options.forEach(option => {
          const radioContainer = Utils.createElement('div', 'radio-item');
          const isSelected = option.value === currentValue;
          const radio = Utils.createElement('input', 'setting-radio', {
            type: 'radio',
            id: `${item.id}-${option.value}`,
            name: item.id,
            value: option.value
          });
          
          // 确保在添加到DOM后再设置checked属性
          radio.checked = isSelected;
          
          const radioLabel = Utils.createElement('label', '', { for: `${item.id}-${option.value}` }, option.label);
          radioContainer.append(radio, radioLabel);
          radioGroup.appendChild(radioContainer);
        });
        
        // 为主题选择器添加事件监听
        if (item.id === 'theme') {
          radioGroup.addEventListener('change', (e) => {
            if (e.target.type === 'radio') {
              Settings.handleThemeChange(e.target.value);
            }
          });
        } else if (item.id === 'sync-mode') {
          radioGroup.addEventListener('change', (e) => {
            if (e.target.type === 'radio') {
              Settings.handleSyncModeChange(e.target.value);
            }
          });
        }
        
        itemControl.appendChild(radioGroup);
        break;
        
      case 'text':
        const textInput = Utils.createElement('input', 'setting-input', {
          type: 'text',
          id: item.id,
          value: currentValue || '',
          placeholder: item.placeholder || ''
        });
        
        // AI相关设置事件监听
        if (item.id.startsWith('ai-')) {
          textInput.addEventListener('change', (e) => {
            Settings.handleAISettingChange(item.id, e.target.value);
          });
        }
        
        itemControl.appendChild(textInput);
        break;
        
      case 'password':
        const passwordInput = Utils.createElement('input', 'setting-input', {
          type: 'password',
          id: item.id,
          value: currentValue || '',
          placeholder: item.placeholder || ''
        });
        
        // AI相关设置事件监听
        if (item.id.startsWith('ai-')) {
          passwordInput.addEventListener('change', (e) => {
            Settings.handleAISettingChange(item.id, e.target.value);
          });
        }
        
        itemControl.appendChild(passwordInput);
        break;
        
      case 'textarea':
        const textarea = Utils.createElement('textarea', 'setting-textarea', {
          id: item.id,
          rows: item.rows || 4,
          placeholder: item.placeholder || ''
        });
        textarea.value = currentValue || '';
        
        // AI相关设置事件监听
        if (item.id.startsWith('ai-')) {
          textarea.addEventListener('change', (e) => {
            Settings.handleAISettingChange(item.id, e.target.value);
          });
        }
        
        itemControl.appendChild(textarea);
        break;
        
      case 'custom':
        if (item.id === 'search-engine-list') {
          const searchEngineList = await Settings.createSearchEngineList();
          itemControl.appendChild(searchEngineList);
        } else if (item.id === 'ai-provider-list') {
          const aiProviderList = await Settings.createAIProviderList();
          itemControl.appendChild(aiProviderList);
        } else if (item.id === 'ai-quick-prompts') {
          const quickPromptsEditor = Settings.createQuickPromptsEditor();
          itemControl.appendChild(quickPromptsEditor);
        } else if (item.id === 'sync-status') {
          const syncStatus = Settings.createSyncStatusDisplay();
          itemControl.appendChild(syncStatus);
        } else if (item.id === 'sync-actions') {
          const syncActions = Settings.createSyncActionsPanel();
          itemControl.appendChild(syncActions);
        }
        break;
        
      case 'button':
        const button = Utils.createElement('button', `btn ${item.buttonClass || 'btn-primary'}`, {
          id: item.id,
          type: 'button'
        }, item.buttonText || item.label);
        
        if (item.id === 'add-search-engine') {
          button.addEventListener('click', () => {
            Settings.showAddSearchEngineModal();
          });
        } else if (item.id === 'add-ai-provider') {
          button.addEventListener('click', () => {
            Settings.showAddAIProviderModal();
          });
        }
        
        itemControl.appendChild(button);
        break;
    }
    
    itemElement.append(itemHeader, itemControl);
    return itemElement;
  },

  createSearchEngineList: async () => {
    const listContainer = Utils.createElement('div', 'search-engine-list-container');
    
    try {
      const engines = await SearchEngineAPI.getAllEnginesAsync();
      const currentEngine = SearchEngineAPI.getCurrentEngine();
      
      engines.forEach((engine, index) => {
        const engineItem = Utils.createElement('div', 'search-engine-item-setting');
        
        // 引擎图标 - 使用 IconManager
        const engineIcon = Utils.createElement('img', 'engine-icon', {
          alt: engine.name,
          style: 'width: 24px; height: 24px; object-fit: contain;'
        });
        
        // 使用 IconManager 设置图标
        IconManager.setIconForElement(engineIcon, engine.url);
        engineIcon.onerror = () => IconManager.handleIconError(engineIcon, '../favicon.png');
        
        // 引擎名称
        const engineName = Utils.createElement('div', 'engine-name', {}, engine.name);
        
        // 引擎URL
        const engineUrl = Utils.createElement('div', 'engine-url', {}, engine.url);
        
        // 当前引擎标识
        const isCurrentEngine = currentEngine && currentEngine.name === engine.name;
        if (isCurrentEngine) {
          engineItem.classList.add('current-engine');
          const currentBadge = Utils.createElement('span', 'current-badge', {}, I18n.getMessage('currentEngine', '当前'));
          engineItem.appendChild(currentBadge);
        }
        
        // 引擎信息容器
        const engineInfo = Utils.createElement('div', 'engine-info');
        engineInfo.append(engineName, engineUrl);
        
        // 操作按钮
        const engineActions = Utils.createElement('div', 'engine-actions');
        
        // 设为当前按钮
        if (!isCurrentEngine) {
          const setCurrentBtn = Utils.createElement('button', 'btn btn-small btn-primary', {}, I18n.getMessage('setAsCurrent', '设为当前'));
          setCurrentBtn.addEventListener('click', async () => {
            const success = await SearchEngineAPI.setCurrentEngine(index);
            if (success) {
              // 刷新搜索引擎列表
              Settings.refreshSearchEngineList();
            }
          });
          engineActions.appendChild(setCurrentBtn);
        }
        
        // 编辑按钮
        const editBtn = Utils.createElement('button', 'btn btn-small btn-secondary', {}, I18n.getMessage('edit', '编辑'));
        editBtn.addEventListener('click', () => {
          Settings.showEditSearchEngineModal(engine, index);
        });
        engineActions.appendChild(editBtn);
        
        // 删除按钮
        if (engines.length > 1) {
          const deleteBtn = Utils.createElement('button', 'btn btn-small btn-danger', {}, I18n.getMessage('delete', '删除'));
          deleteBtn.addEventListener('click', () => {
            Notification.notify({
              title: I18n.getMessage('confirmDelete', '确认删除'),
              message: `${I18n.getMessage('confirmDeleteEngine', '确定要删除搜索引擎')} "${engine.name}" ${I18n.getMessage('confirmDeleteEngineSuffix', '吗？')}`,
              duration: 0,
              type: 'confirm',
              buttons: [
                {
                  text: I18n.getMessage('confirm', '确认'),
                  class: 'btn-primary confirm-yes',
                  callback: async () => {
                    const success = await SearchEngineAPI.deleteEngine(index);
                    if (success) {
                      Settings.refreshSearchEngineList();
                    }
                  }
                },
                {
                  text: I18n.getMessage('cancel', '取消'),
                  class: 'confirm-no',
                  callback: () => {}
                }
              ]
            });
          });
          engineActions.appendChild(deleteBtn);
        }
        
        engineItem.append(engineIcon, engineInfo, engineActions);
        listContainer.appendChild(engineItem);
      });
      
    } catch (error) {
      console.error('创建搜索引擎列表失败:', error);
      const errorMsg = Utils.createElement('div', 'error-message', {}, I18n.getMessage('loadEngineListError', '加载搜索引擎列表失败'));
      listContainer.appendChild(errorMsg);
    }
    
    return listContainer;
  },

  refreshSearchEngineList: async () => {
    const listContainer = document.querySelector('.search-engine-list-container');
    if (!listContainer) return;
    
    const newList = await Settings.createSearchEngineList();
    listContainer.parentNode.replaceChild(newList, listContainer);
  },

  showAddSearchEngineModal: () => {
    const formItems = [
      {
        type: 'text',
        id: 'custom-engine-name',
        label: I18n.getMessage('engineName', '搜索引擎名称'),
        required: true
      },
      {
        type: 'url',
        id: 'custom-engine-url',
        label: I18n.getMessage('engineSearchUrl', '搜索URL'),
        placeholder: 'https://www.example.com/search?q=%s',
        required: true
      },
      {
        type: 'url',
        id: 'custom-engine-icon',
        label: I18n.getMessage('engineIconUrl', '图标URL（可选）'),
        required: false
      }
    ];

    Menu.showFormModal(
      I18n.getMessage('addCustomSearchEngine', '添加自定义搜索引擎'),
      formItems,
      async (formData) => {
        const name = formData['custom-engine-name'];
        const url = formData['custom-engine-url'];
        const icon = formData['custom-engine-icon'];
        
        const success = await SearchEngineAPI.addCustomEngine({ name, url, icon });
        if (success) {
          Settings.refreshSearchEngineList();
          Notification.notify({
            title: I18n.getMessage('success', '成功'),
            message: I18n.getMessage('addEngineSuccess', '搜索引擎添加成功'),
            type: 'success',
            duration: 2000
          });
        } else {
          Notification.notify({
            title: I18n.getMessage('error', '错误'),
            message: I18n.getMessage('addEngineError', '添加搜索引擎失败'),
            type: 'error',
            duration: 3000
          });
        }
      },
      I18n.getMessage('confirm', '确认'),
      I18n.getMessage('cancel', '取消')
    );
  },

  showEditSearchEngineModal: (engine, index) => {
    const formItems = [
      {
        type: 'text',
        id: 'edit-engine-name',
        label: I18n.getMessage('engineName', '搜索引擎名称'),
        value: engine.name,
        required: true
      },
      {
        type: 'url',
        id: 'edit-engine-url',
        label: I18n.getMessage('engineSearchUrl', '搜索URL'),
        value: engine.url,
        required: true
      },
      {
        type: 'url',
        id: 'edit-engine-icon',
        label: I18n.getMessage('engineIconUrl', '图标URL（可选）'),
        value: engine.icon || '',
        required: false
      }
    ];

    Menu.showFormModal(
      `${I18n.getMessage('editEngine', '编辑搜索引擎')} - ${engine.name}`,
      formItems,
      async (formData) => {
        const name = formData['edit-engine-name'];
        const url = formData['edit-engine-url'];
        const icon = formData['edit-engine-icon'];
        
        const success = await SearchEngineAPI.editEngine(index, { name, url, icon });
        if (success) {
          Settings.refreshSearchEngineList();
          Notification.notify({
            title: I18n.getMessage('success', '成功'),
            message: I18n.getMessage('updateEngineSuccess', '搜索引擎更新成功'),
            type: 'success',
            duration: 2000
          });
        } else {
          Notification.notify({
            title: I18n.getMessage('error', '错误'),
            message: I18n.getMessage('updateEngineError', '更新搜索引擎失败'),
            type: 'error',
            duration: 3000
          });
        }
      },
      I18n.getMessage('save', '保存'),
      I18n.getMessage('cancel', '取消')
    );
  },

  /**
   * 创建AI供应商列表
   * @returns {HTMLElement} - AI供应商列表容器
   */
  createAIProviderList: async () => {
    const listContainer = Utils.createElement('div', 'ai-provider-list-container');
    
    try {
      const aiConfig = AI.getConfig();
      const providers = aiConfig.providers || [
        {
          name: 'OpenAI',
          apiUrl: 'https://api.openai.com/v1/chat/completions',
          model: 'gpt-3.5-turbo',
          isDefault: true
        }
      ];
      const currentProvider = aiConfig.currentProvider || providers[0];
      
      providers.forEach((provider, index) => {
        const providerItem = Utils.createElement('div', 'search-engine-item-setting');
        
        // 供应商图标 - 改进图标获取逻辑
        const providerIcon = Utils.createElement('img', 'engine-icon', {
          alt: provider.name,
          style: 'width: 24px; height: 24px; object-fit: contain;'
        });
        
        // 改进图标URL获取逻辑
        let iconUrl;
        if (provider.iconUrl) {
          // 如果有自定义图标URL，直接使用
          iconUrl = provider.iconUrl;
        } else {
          // 如果没有自定义图标，从API URL提取主域名
          try {
            const apiDomain = new URL(provider.apiUrl);
            // 将API域名转换为主站域名
            let mainDomain = apiDomain.origin;
            
            // 处理常见的API子域名模式
            if (apiDomain.hostname.startsWith('api.')) {
              mainDomain = `${apiDomain.protocol}//${apiDomain.hostname.replace('api.', '')}`;
            }
            
            iconUrl = mainDomain;
          } catch (error) {
            console.warn('解析API URL失败:', provider.apiUrl, error);
            iconUrl = provider.apiUrl;
          }
        }
        
        // 使用 IconManager 设置图标
        IconManager.setIconForElement(providerIcon, iconUrl);
        providerIcon.onerror = () => IconManager.handleIconError(providerIcon, '../favicon.png');
        
        // 供应商名称
        const providerName = Utils.createElement('div', 'engine-name', {}, provider.name);
        
        // 供应商API URL（对应搜索引擎的URL）
        const providerUrl = Utils.createElement('div', 'engine-url', {}, provider.apiUrl);
        
        // 当前供应商标识
        const isCurrentProvider = currentProvider && currentProvider.name === provider.name;
        if (isCurrentProvider) {
          providerItem.classList.add('current-engine');
          const currentBadge = Utils.createElement('span', 'current-badge', {}, I18n.getMessage('currentEngine', '当前'));
          providerItem.appendChild(currentBadge);
        }
        
        // 供应商信息容器
        const providerInfo = Utils.createElement('div', 'engine-info');
        providerInfo.append(providerName, providerUrl);
        
        // 操作按钮
        const providerActions = Utils.createElement('div', 'engine-actions');
        
        // 设为当前按钮
        if (!isCurrentProvider) {
          const setCurrentBtn = Utils.createElement('button', 'btn btn-small btn-primary', {}, 
            I18n.getMessage('setAsCurrent', '设为当前'));
          setCurrentBtn.addEventListener('click', async () => {
            const success = await AI.updateConfig({ currentProvider: provider });
            if (success) {
              Settings.refreshAIProviderList();
              Notification.notify({
                title: I18n.getMessage('success', '成功'),
                message: I18n.getMessage('providerSwitched', 'AI供应商已切换'),
                type: 'success',
                duration: 2000
              });
            }
          });
          providerActions.appendChild(setCurrentBtn);
        }
        
        // 编辑按钮
        const editBtn = Utils.createElement('button', 'btn btn-small btn-secondary', {}, 
          I18n.getMessage('edit', '编辑'));
        editBtn.addEventListener('click', () => {
          Settings.showEditAIProviderModal(provider, index);
        });
        providerActions.appendChild(editBtn);
        
        // 删除按钮（不能删除默认供应商或最后一个供应商）
        if (!provider.isDefault && providers.length > 1) {
          const deleteBtn = Utils.createElement('button', 'btn btn-small btn-danger', {}, 
            I18n.getMessage('delete', '删除'));
          deleteBtn.addEventListener('click', () => {
            Notification.notify({
              title: I18n.getMessage('confirmDelete', '确认删除'),
              message: `${I18n.getMessage('confirmDeleteProvider', '确定要删除AI供应商')} "${provider.name}" ${I18n.getMessage('confirmDeleteProviderSuffix', '吗？')}`,
              duration: 0,
              type: 'confirm',
              buttons: [
                {
                  text: I18n.getMessage('confirm', '确认'),
                  class: 'btn-primary confirm-yes',
                  callback: async () => {
                    const newProviders = providers.filter((_, i) => i !== index);
                    // 如果删除的是当前供应商，设置第一个为当前供应商
                    const newCurrentProvider = isCurrentProvider ? newProviders[0] : currentProvider;
                    const success = await AI.updateConfig({ 
                      providers: newProviders,
                      currentProvider: newCurrentProvider
                    });
                    if (success) {
                      Settings.refreshAIProviderList();
                      Notification.notify({
                        title: I18n.getMessage('success', '成功'),
                        message: I18n.getMessage('providerDeleted', 'AI供应商已删除'),
                        type: 'success',
                        duration: 2000
                      });
                    }
                  }
                },
                {
                  text: I18n.getMessage('cancel', '取消'),
                  class: 'confirm-no',
                  callback: () => {}
                }
              ]
            });
          });
          providerActions.appendChild(deleteBtn);
        }
        
        providerItem.append(providerIcon, providerInfo, providerActions);
        listContainer.appendChild(providerItem);
      });
      
    } catch (error) {
      console.error('创建AI供应商列表失败:', error);
      const errorMsg = Utils.createElement('div', 'error-message', {}, I18n.getMessage('loadProviderListError', '加载AI供应商列表失败'));
      listContainer.appendChild(errorMsg);
    }
    
    return listContainer;
  },

  /**
   * 刷新AI供应商列表
   */
  refreshAIProviderList: async () => {
    const listContainer = document.querySelector('.ai-provider-list-container');
    if (!listContainer) return;
    
    const newList = await Settings.createAIProviderList();
    listContainer.parentNode.replaceChild(newList, listContainer);
  },

  /**
   * 显示添加AI供应商模态框
   */  showAddAIProviderModal: () => {
    const formItems = [
      {
        type: 'text',
        id: 'custom-provider-name',
        label: I18n.getMessage('providerName', 'AI供应商名称'),
        required: true,
        placeholder: 'ChatGPT, Claude, Gemini...'
      },
      {
        type: 'url',
        id: 'custom-provider-api-url',
        label: I18n.getMessage('providerApiUrl', 'API地址'),
        placeholder: 'https://api.openai.com/v1/chat/completions',
        required: true
      },
      {
        type: 'password-toggle',
        id: 'custom-provider-api-key',
        label: I18n.getMessage('providerApiKey', 'API密钥'),
        placeholder: 'sk-...',
        required: true
      },
      {
        // 添加获取模型按钮
        id: 'fetch-models-btn',
        type: 'custom',
        render: (container) => {
          const btnContainer = Utils.createElement('div', 'fetch-models-container');
          
          // 创建获取模型按钮
          const fetchBtn = Utils.createElement('button', 'fetch-models-btn btn btn-secondary', {
            type: 'button'
          }, I18n.getMessage('fetchModels', '获取可用模型'));
          
          // 状态显示
          const statusContainer = Utils.createElement('div', 'fetch-models-status');
          
          btnContainer.appendChild(fetchBtn);
          btnContainer.appendChild(statusContainer);
          container.appendChild(btnContainer);          // 绑定获取模型事件
          fetchBtn.addEventListener('click', async () => {
            const urlInput = document.getElementById('custom-provider-api-url');
            const keyInput = document.getElementById('custom-provider-api-key');
            const modelInput = document.getElementById('custom-provider-model');
            const modelInputContainer = modelInput ? modelInput.parentElement : null;
            
            const apiUrl = urlInput.value.trim();
            const apiKey = keyInput.value.trim();
            
            if (!apiUrl || !apiKey) {
              statusContainer.textContent = I18n.getMessage('pleaseProvideApiInfo', '请先填写API地址和密钥');
              statusContainer.className = 'fetch-models-status error';
              return;
            }
            
            // 更新状态
            statusContainer.textContent = I18n.getMessage('fetchingModels', '正在获取模型列表...');
            statusContainer.className = 'fetch-models-status loading';
            fetchBtn.disabled = true;
            
            try {
              // 调用获取模型API
              const models = await AI.getModels(apiUrl, apiKey);
              
              // 检查输入元素是否存在
              const oldInput = document.getElementById('custom-provider-model');
              if (oldInput && modelInputContainer) {
                // 创建新的下拉框                // 判断元素类型，如果已经是select，就更新它，否则创建新的下拉框
                let select;
                if (oldInput.tagName.toLowerCase() === 'select') {
                  // 如果已经是select元素，清空并重用
                  select = oldInput;
                  select.innerHTML = ''; // 清空现有选项
                } else {
                  // 创建新的select元素替换文本输入
                  select = document.createElement('select');
                  select.id = 'custom-provider-model';
                  select.className = 'setting-select';
                  select.required = true;
                  
                  // 替换输入框
                  modelInputContainer.replaceChild(select, oldInput);
                }
                
                // 添加模型选项
                models.forEach(model => {
                  const option = document.createElement('option');
                  option.value = model;
                  option.textContent = model;
                  select.appendChild(option);
                });
              }
              
              // 更新状态提示
              statusContainer.textContent = I18n.getMessage('modelsLoaded', '已加载 ' + models.length + ' 个模型');
              statusContainer.className = 'fetch-models-status success';
            } catch (error) {
              // 处理错误
              statusContainer.innerHTML = '';
              
              // 错误信息
              const errorText = Utils.createElement('span', '', {}, error.message);
              statusContainer.appendChild(errorText);
              
              // 添加重试按钮
              const retryBtn = Utils.createElement('button', 'fetch-models-retry-btn', {}, I18n.getMessage('retry', '重试'));
              retryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fetchBtn.click();
              });
              statusContainer.appendChild(retryBtn);
              
              statusContainer.className = 'fetch-models-status error';
              
              console.error('获取模型失败:', error);
            } finally {
              // 恢复按钮状态
              fetchBtn.disabled = false;
            }
          });
        }
      },
      {
        type: 'text',
        id: 'custom-provider-model',
        label: I18n.getMessage('providerModel', '模型名称'),
        placeholder: 'gpt-3.5-turbo',
        required: true,
        description: I18n.getMessage('modelSelectDescription', '点击上方的"获取可用模型"按钮加载可选项')
      },
      {
        type: 'url',
        id: 'custom-provider-icon',
        label: I18n.getMessage('providerIconUrl', '图标URL（可选）'),
        placeholder: 'https://example.com/icon.png',
        required: false
      }
    ];

    Menu.showFormModal(
      I18n.getMessage('addCustomAIProvider', '添加自定义AI供应商'),
      formItems,
      async (formData) => {
        const name = formData['custom-provider-name'];
        const apiUrl = formData['custom-provider-api-url'];
        const apiKey = formData['custom-provider-api-key'];
        const model = formData['custom-provider-model'];
        const iconUrl = formData['custom-provider-icon'];
        
        const aiConfig = AI.getConfig();
        const providers = aiConfig.providers || [];
        const newProvider = { name, apiUrl, apiKey, model, iconUrl };
        
        const success = await AI.updateConfig({ 
          providers: [...providers, newProvider],
          currentProvider: newProvider
        });
        
        if (success) {
          Settings.refreshAIProviderList();
          Notification.notify({
            title: I18n.getMessage('success', '成功'),
            message: I18n.getMessage('addProviderSuccess', 'AI供应商添加成功'),
            type: 'success',
            duration: 2000
          });
        } else {
          Notification.notify({
            title: I18n.getMessage('error', '错误'),
            message: I18n.getMessage('addProviderError', '添加AI供应商失败'),
            type: 'error',
            duration: 3000
          });
        }
      },
      I18n.getMessage('confirm', '确认'),
      I18n.getMessage('cancel', '取消')
    );
  },

  /**
   * 显示编辑AI供应商模态框
   * @param {Object} provider - AI供应商对象
   * @param {number} index - 供应商索引
   */  showEditAIProviderModal: (provider, index) => {    const formItems = [
      {
        type: 'text',
        id: 'edit-provider-name',
        label: I18n.getMessage('providerName', 'AI供应商名称'),
        value: provider.name,
        required: true
      },
      {
        type: 'url',
        id: 'edit-provider-api-url',
        label: I18n.getMessage('providerApiUrl', 'API地址'),
        value: provider.apiUrl,
        required: true,
        onchange: (e) => {
          // 当API地址变更时，如果有API密钥，尝试获取模型列表
          const apiUrl = e.target.value.trim();
          const apiKeyInput = document.getElementById('edit-provider-api-key');
          if (apiKeyInput && apiUrl && apiKeyInput.value.trim()) {
            // 延迟触发获取模型按钮点击
            setTimeout(() => {
              document.querySelector('.fetch-models-btn')?.click();
            }, 500);
          }
        }
      },
      {
        type: 'password-toggle',
        id: 'edit-provider-api-key',
        label: I18n.getMessage('providerApiKey', 'API密钥'),
        value: provider.apiKey || '',
        required: true,
        onchange: (e) => {
          // 当API密钥变更时，如果有API URL，尝试获取模型列表
          const apiKey = e.target.value.trim();
          const apiUrlInput = document.getElementById('edit-provider-api-url');
          if (apiUrlInput && apiKey && apiUrlInput.value.trim()) {
            // 延迟触发获取模型按钮点击
            setTimeout(() => {
              document.querySelector('.fetch-models-btn')?.click();
            }, 500);
          }
        }
      },
      {
        // 添加获取模型按钮（自定义元素）
        id: 'fetch-models-btn',
        type: 'custom',
        render: (container) => {
          const btnContainer = Utils.createElement('div', 'fetch-models-container');
          
          // 创建获取模型按钮
          const fetchBtn = Utils.createElement('button', 'fetch-models-btn btn btn-secondary', {
            type: 'button'
          }, I18n.getMessage('fetchModels', '获取可用模型'));
          
          // 状态显示
          const statusContainer = Utils.createElement('div', 'fetch-models-status');
          
          btnContainer.appendChild(fetchBtn);
          btnContainer.appendChild(statusContainer);
          container.appendChild(btnContainer);            // 绑定获取模型事件
          fetchBtn.addEventListener('click', async () => {
            const urlInput = document.getElementById('edit-provider-api-url');
            const keyInput = document.getElementById('edit-provider-api-key');
            const modelElement = document.getElementById('edit-provider-model');
            const modelContainer = modelElement ? modelElement.parentElement : null;
            
            const apiUrl = urlInput.value.trim();
            const apiKey = keyInput.value.trim();
            
            if (!apiUrl || !apiKey) {
              statusContainer.textContent = I18n.getMessage('pleaseProvideApiInfo', '请先填写API地址和密钥');
              statusContainer.className = 'fetch-models-status error';
              return;
            }
            
            // 更新状态
            statusContainer.textContent = I18n.getMessage('fetchingModels', '正在获取模型列表...');
            statusContainer.className = 'fetch-models-status loading';
            fetchBtn.disabled = true;
            
            try {
              // 调用获取模型API
              const models = await AI.getModels(apiUrl, apiKey);
              
              // 检查是否找到模型元素和容器
              if (!modelElement || !modelContainer) {
                throw new Error('找不到模型输入元素');
              }
              
              let modelSelect;
              // 如果当前已经是select元素，直接使用它
              if (modelElement.tagName.toLowerCase() === 'select') {
                modelSelect = modelElement;
                // 清除现有选项
                modelSelect.innerHTML = '';
              } else {
                // 否则创建新的select元素替换文本输入
                modelSelect = document.createElement('select');
                modelSelect.id = 'edit-provider-model';
                modelSelect.className = 'setting-select';
                modelSelect.required = true;
                
                // 替换输入框
                modelContainer.replaceChild(modelSelect, modelElement);
              }
              
              // 添加获取到的模型列表
              models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelSelect.appendChild(option);
              });
              
              // 如果有当前模型，选中它
              if (provider.model && models.includes(provider.model)) {
                modelSelect.value = provider.model;
              } else if (models.length > 0) {
                // 选择第一个可用模型
                modelSelect.value = models[0];
              }
                // 确保选择框是启用状态
              modelSelect.disabled = false;
              
              // 更新状态提示
              statusContainer.textContent = I18n.getMessage('modelsLoaded', '已加载 ' + models.length + ' 个模型');
              statusContainer.className = 'fetch-models-status success';
            } catch (error) {
              // 处理错误
              // 更新状态提示并添加重试按钮
              statusContainer.innerHTML = '';
              
              // 错误信息
              const errorText = Utils.createElement('span', '', {}, error.message);
              statusContainer.appendChild(errorText);
              
              // 添加重试按钮
              const retryBtn = Utils.createElement('button', 'fetch-models-retry-btn', {}, I18n.getMessage('retry', '重试'));
              retryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 重新触发获取模型
                fetchBtn.click();
              });
              statusContainer.appendChild(retryBtn);
              
              statusContainer.className = 'fetch-models-status error';
              
              console.error('获取模型失败:', error);
            } finally {
              // 恢复按钮状态
              fetchBtn.disabled = false;
            }
          });
        }
      },
      {
        type: 'select',
        id: 'edit-provider-model',
        label: I18n.getMessage('providerModel', '模型名称'),
        value: provider.model,
        options: [{ value: provider.model, label: provider.model }],
        required: true,
        description: I18n.getMessage('modelSelectDescription', '点击上方的"获取可用模型"按钮加载可选项')
      },
      {
        type: 'url',
        id: 'edit-provider-icon',
        label: I18n.getMessage('providerIconUrl', '图标URL（可选）'),
        value: provider.iconUrl || '',
        required: false
      }
    ];

    Menu.showFormModal(
      `${I18n.getMessage('editProvider', '编辑AI供应商')} - ${provider.name}`,
      formItems,
      async (formData) => {
        const name = formData['edit-provider-name'];
        const apiUrl = formData['edit-provider-api-url'];
        const apiKey = formData['edit-provider-api-key'];
        const model = formData['edit-provider-model'];
        const iconUrl = formData['edit-provider-icon'];
        
        const aiConfig = AI.getConfig();
        const providers = [...aiConfig.providers];
        const updatedProvider = { ...provider, name, apiUrl, apiKey, model, iconUrl };
        providers[index] = updatedProvider;
        
        // 如果编辑的是当前供应商，更新当前供应商配置
        let updateConfig = { providers };
        if (aiConfig.currentProvider && aiConfig.currentProvider.name === provider.name) {
          updateConfig.currentProvider = updatedProvider;
        }
        
        const success = await AI.updateConfig(updateConfig);
        if (success) {
          Settings.refreshAIProviderList();
          Notification.notify({
            title: I18n.getMessage('success', '成功'),
            message: I18n.getMessage('updateProviderSuccess', 'AI供应商更新成功'),
            type: 'success',
            duration: 2000
          });
        } else {
          Notification.notify({
            title: I18n.getMessage('error', '错误'),
            message: I18n.getMessage('updateProviderError', '更新AI供应商失败'),
            type: 'error',
            duration: 3000
          });
        }
      },
      I18n.getMessage('save', '保存'),
      I18n.getMessage('cancel', '取消')
    );
  },

  /**
   * 处理网格系统启用/禁用
   * @param {boolean} enabled - 是否启用网格系统
   */
  handleGridEnabledChange(enabled) {
    return new Promise((resolve) => {
      try {
        console.log('处理网格系统启用状态变化:', enabled);
        
        if (window.GridSystem) {
          GridSystem.toggleGridSystem(enabled);
          
          // 显示通知
          Notification.notify({
            title: enabled 
              ? I18n.getMessage('gridSystemEnabled', '网格系统已启用')
              : I18n.getMessage('gridSystemDisabled', '网格系统已禁用'),
            message: enabled
              ? I18n.getMessage('gridSystemEnabledMessage', '元素将吸附到网格')
              : I18n.getMessage('gridSystemDisabledMessage', '元素将自由放置'),
            type: enabled ? 'success' : 'info',
            duration: 2000
          });
          
          // 触发设置同步事件
          window.dispatchEvent(new CustomEvent('gridSettingsChanged', { 
            detail: { type: 'enabled', value: enabled } 
          }));
          
          console.log('网格系统状态变化处理完成:', enabled);
          resolve(true);
        } else {
          console.error('GridSystem 未初始化');
          resolve(false);
        }
      } catch (error) {
        console.error('处理网格启用状态变化失败:', error);
        resolve(false);
      }
    });
  },

  /**
   * 处理网格调试模式切换
   * @param {boolean} enabled - 是否启用调试模式
   */
  handleGridDebugChange(enabled) {
    return new Promise((resolve) => {
      try {
        console.log('处理网格调试状态变化:', enabled);
        
        if (window.GridSystem) {
          GridSystem.toggleGridDebug(enabled);
          
          // 显示通知
          Notification.notify({
            title: enabled
              ? I18n.getMessage('gridDebugEnabled', '网格调试已启用')
              : I18n.getMessage('gridDebugDisabled', '网格调试已禁用'),
            message: enabled
              ? I18n.getMessage('gridDebugEnabledMessage', '现在您可以看到网格线')
              : I18n.getMessage('gridDebugDisabledMessage', '网格线已隐藏'),
            type: 'info',
            duration: 2000
          });
          
          // 触发设置同步事件
          window.dispatchEvent(new CustomEvent('gridSettingsChanged', { 
            detail: { type: 'debug', value: enabled } 
          }));
          
          console.log('网格调试状态变化处理完成:', enabled);
          resolve(true);
        } else {
          console.error('GridSystem 未初始化');
          resolve(false);
        }
      } catch (error) {
        console.error('处理网格调试状态变化失败:', error);
        resolve(false);
      }
    });
  },

  /**
   * 处理网格吸附阈值变化
   * @param {number} threshold - 新的吸附阈值
   */
  handleGridSnapThresholdChange(threshold) {
    try {
      console.log('处理网格吸附阈值变化:', threshold);
      
      if (window.GridSystem) {
        GridSystem.setSnapThreshold(threshold);
        
        // 触发设置同步事件
        window.dispatchEvent(new CustomEvent('gridSettingsChanged', { 
          detail: { type: 'snapThreshold', value: threshold } 
        }));
        
        console.log('网格吸附阈值变化处理完成:', threshold);
        return true;
      } else {
        console.error('GridSystem 未初始化');
        return false;
      }
    } catch (error) {
      console.error('处理网格吸附阈值变化失败:', error);
      return false;
    }
  },

  // 改进设置同步方法
  syncSettingsWithSystem() {
    console.log('开始同步设置与系统状态');
    
    try {
      // 同步网格系统设置
      const gridEnabledCheckbox = document.getElementById('grid-enabled');
      const gridDebugCheckbox = document.getElementById('grid-debug');
      const gridSnapThresholdRange = document.getElementById('grid-snap-threshold');
      
      if (window.GridSystem) {
        if (gridEnabledCheckbox) {
          const currentEnabled = GridSystem.gridEnabled;
          gridEnabledCheckbox.checked = currentEnabled;
          console.log('同步网格启用状态:', currentEnabled);
        }
        
        if (gridDebugCheckbox) {
          const currentDebug = GridSystem.isDebugMode;
          gridDebugCheckbox.checked = currentDebug;
          console.log('同步网格调试状态:', currentDebug);
        }
        
        if (gridSnapThresholdRange) {
          const currentThreshold = GridSystem.snapThreshold;
          gridSnapThresholdRange.value = currentThreshold;
          const rangeValue = gridSnapThresholdRange.parentElement?.querySelector('.range-value');
          if (rangeValue) {
            rangeValue.textContent = `${currentThreshold}px`;
          }
          console.log('同步网格吸附阈值:', currentThreshold);
        }
      } else {
        console.warn('GridSystem 未初始化，跳过网格设置同步');
      }
      
      // 同步AI设置
      const aiEnabledCheckbox = document.getElementById('ai-enabled');
      if (window.AI && aiEnabledCheckbox) {
        const currentAIEnabled = AI.getConfig().enabled;
        aiEnabledCheckbox.checked = currentAIEnabled;
        console.log('同步AI启用状态:', currentAIEnabled);
      }
      
      // 同步数据同步设置
      const syncModeRadios = document.getElementsByName('sync-mode');
      if (syncModeRadios) {
        const currentSyncMode = localStorage.getItem('sync-mode') || 'disabled';
        syncModeRadios.forEach(radio => {
          if (radio.value === currentSyncMode) {
            radio.checked = true;
          } else {
            radio.checked = false;
          }
        });
        console.log('同步设置 - 同步模式:', currentSyncMode);
      }
      
      const syncIntervalSelect = document.getElementById('sync-interval');
      if (syncIntervalSelect) {
        const currentSyncInterval = localStorage.getItem('sync-interval') || '0';
        syncIntervalSelect.value = currentSyncInterval;
        console.log('同步设置 - 自动同步间隔:', currentSyncInterval);
      }
      
      console.log('设置同步完成');
    } catch (error) {
      console.error('同步设置失败:', error);
    }
  },

  bindEvents: (modalId) => {
    // 绑定关闭按钮事件
    const closeBtn = document.querySelector(`#${modalId} .modal-close`);
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        Menu.Modal.hide(modalId);
      });
    }

    // 绑定分类切换事件
    const categoryItems = document.querySelectorAll(`#${modalId} .settings-category`);
    categoryItems.forEach(item => {
      item.addEventListener('click', () => {
        // 移除所有分类的激活状态
        categoryItems.forEach(cat => cat.classList.remove('active'));
        
        // 添加当前分类的激活状态
        item.classList.add('active');
        
        // 更新当前分类
        Settings.currentCategory = item.dataset.category;
        
        // 渲染分类内容
        Settings.renderCategoryContent(Settings.currentCategory);
      });
    });

    // 绑定模态框外部点击关闭事件
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          Menu.Modal.hide(modalId);
        }
      });
    }

    // 绑定ESC键关闭事件
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        Menu.Modal.hide(modalId);
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    document.addEventListener('keydown', handleEscKey);
    
    // 绑定同步间隔变化事件
    const syncIntervalSelect = document.getElementById('sync-interval');
    if (syncIntervalSelect) {
      syncIntervalSelect.addEventListener('change', (e) => {
        const interval = e.target.value;
        localStorage.setItem('sync-interval', interval);
        
        // 重启自动同步
        const syncMode = localStorage.getItem('sync-mode');
        if (syncMode !== 'disabled') {
          Settings.startAutoSync();
        }
        
        Notification.notify({
          title: I18n.getMessage('syncIntervalChanged', '同步间隔已更改'),
          message: interval === '0' ? 
            I18n.getMessage('autoSyncDisabled', '自动同步已关闭') :
            I18n.getMessage('autoSyncEnabled', '自动同步已启用'),
          type: 'info',
          duration: 2000
        });
      });
    }
  },

  /**
   * 处理主题变化
   * @param {string} theme - 主题值 ('auto', 'light', 'dark')
   */
  handleThemeChange(theme) {
    try {
      localStorage.setItem('theme', theme);
      
      // 应用主题
      Settings.applyTheme(theme);
      
      // 显示通知
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
      console.error('处理主题变化失败:', error);
    }
  },
  /**
   * 应用主题
   * @param {string} theme - 主题值
   */
  applyTheme(theme) {
    const root = document.documentElement;

    if (theme === 'auto') {
        // 跟随系统主题
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');

        // 移除之前的监听器以避免重复监听
        if (Settings._themeMediaQuery) {
            Settings._themeMediaQuery.removeEventListener('change', Settings._handleSystemThemeChange);
        }

        // 添加系统主题变化监听器
        Settings._themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        Settings._handleSystemThemeChange = (e) => {
            const currentTheme = localStorage.getItem('theme') || 'auto';
            if (currentTheme === 'auto') {
                root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        };
        Settings._themeMediaQuery.addEventListener('change', Settings._handleSystemThemeChange);
    } else {
        root.setAttribute('data-theme', theme);

        // 如果不是 auto 模式，移除系统主题监听器
        if (Settings._themeMediaQuery) {
            Settings._themeMediaQuery.removeEventListener('change', Settings._handleSystemThemeChange);
            Settings._themeMediaQuery = null;
        }
    }
},

  /**
   * 处理AI设置变化
   * @param {string} settingId - 设置ID
   * @param {any} value - 设置值
   */
  handleAISettingChange(settingId, value) {
    try {
      if (!window.AI) return;
      
      const config = AI.getConfig();
      
      switch (settingId) {
        case 'ai-system-prompt':
          AI.updateConfig({ systemPrompt: value });
          break;
        default:
          console.warn(`未知的AI设置: ${settingId}`);
      }
    } catch (error) {
      console.error('处理AI设置变化失败:', error);
    }
  },

  /**
   * 处理AI启用/禁用
   * @param {boolean} enabled - 是否启用AI
   */
  handleAIEnabledChange(enabled) {
    try {
      if (window.AI) {
        AI.updateConfig({ enabled });
        
        // 显示通知
        Notification.notify({
          title: enabled 
            ? I18n.getMessage('aiEnabled', 'AI助手已启用')
            : I18n.getMessage('aiDisabled', 'AI助手已禁用'),
          message: enabled
            ? I18n.getMessage('aiEnabledMessage', '您可以在搜索框旁看到AI按钮')
            : I18n.getMessage('aiDisabledMessage', 'AI功能已关闭'),
          type: enabled ? 'success' : 'info',
          duration: 2000
        });
      }
    } catch (error) {
      console.error('处理AI启用状态变化失败:', error);
    }
  },

  /**
   * 创建快速提示词编辑器
   * @returns {HTMLElement} - 快速提示词编辑器
   */
  createQuickPromptsEditor() {
    const container = Utils.createElement('div', 'quick-prompts-editor');
    
    // 获取当前快速提示词
    const aiConfig = AI.getConfig();
    const quickPrompts = aiConfig.quickPrompts || [
      '翻译成中文',
      '总结要点',
      '解释含义',
      '写作润色'
    ];
    
    // 创建文本区域
    const textarea = Utils.createElement('textarea', 'quick-prompts-textarea', {
      rows: 6,
      placeholder: I18n.getMessage('quickPromptsPlaceholder', '输入快速提示词，用逗号分隔')
    });
    textarea.value = quickPrompts.join(', ');
    
    // 添加保存按钮
    const saveBtn = Utils.createElement('button', 'btn btn-primary save-prompts-btn', {}, 
      I18n.getMessage('save', '保存'));
    
    saveBtn.addEventListener('click', () => {
      const value = textarea.value.trim();
      const prompts = value ? value.split(',').map(p => p.trim()).filter(p => p) : [];
      
      AI.updateConfig({ quickPrompts: prompts });
      
      Notification.notify({
        title: I18n.getMessage('success', '成功'),
        message: I18n.getMessage('quickPromptsSaved', '快速提示词已保存'),
        type: 'success',
        duration: 2000
      });
    });
    
    container.append(textarea, saveBtn);
    return container;
  },

  /**
   * 处理同步模式变化
   * @param {string} mode - 同步模式 ('disabled', 'upload', 'download')
   */
  handleSyncModeChange(mode) {
    try {
      localStorage.setItem('sync-mode', mode);
      
      // 显示通知
      const modeNames = {
        'disabled': I18n.getMessage('syncModeDisabled', '关闭同步'),
        'upload': I18n.getMessage('syncModeUpload', '上传到云端'),
        'download': I18n.getMessage('syncModeDownload', '从云端下载')
      };
      
      Notification.notify({
        title: I18n.getMessage('syncModeChanged', '同步模式已更改'),
        message: `${I18n.getMessage('currentSyncMode', '当前模式')}: ${modeNames[mode]}`,
        type: 'success',
        duration: 2000
      });
      
      // 刷新同步状态显示
      Settings.refreshSyncStatus();
      
      // 如果启用了同步模式，开始自动同步
      if (mode !== 'disabled') {
        Settings.startAutoSync();
      } else {
        Settings.stopAutoSync();
      }
    } catch (error) {
      console.error('处理同步模式变化失败:', error);
    }
  },

  /**
   * 创建同步状态显示
   * @returns {HTMLElement} - 同步状态显示元素
   */
  createSyncStatusDisplay() {
    const container = Utils.createElement('div', 'sync-status-container');
    
    // 当前同步模式
    const currentMode = localStorage.getItem('sync-mode') || 'disabled';
    const modeNames = {
      'disabled': I18n.getMessage('syncModeDisabled', '关闭同步'),
      'upload': I18n.getMessage('syncModeUpload', '上传到云端'), 
      'download': I18n.getMessage('syncModeDownload', '从云端下载')
    };
    
    const modeDisplay = Utils.createElement('div', 'sync-mode-display');
    const modeLabel = Utils.createElement('span', 'sync-mode-label', {}, 
      `${I18n.getMessage('currentSyncMode', '当前模式')}: `);
    const modeValue = Utils.createElement('span', `sync-mode-value ${currentMode}`, {}, 
      modeNames[currentMode]);
    modeDisplay.append(modeLabel, modeValue);
    
    // 最后同步时间
    const lastSyncTime = localStorage.getItem('last-sync-time');
    const timeDisplay = Utils.createElement('div', 'sync-time-display');
    const timeLabel = Utils.createElement('span', 'sync-time-label', {}, 
      `${I18n.getMessage('lastSyncTime', '最后同步')}: `);
       const timeValue = Utils.createElement('span', 'sync-time-value', {}, 
      lastSyncTime ? new Date(parseInt(lastSyncTime)).toLocaleString() : 
      I18n.getMessage('neverSynced', '从未同步'));
    timeDisplay.append(timeLabel, timeValue);
    
    // 同步状态
    const syncResult = localStorage.getItem('last-sync-result') || 'none';
    const statusDisplay = Utils.createElement('div', 'sync-status-display');
    const statusLabel = Utils.createElement('span', 'sync-status-label', {}, 
      `${I18n.getMessage('syncStatus', '同步状态')}: `);
    const statusValue = Utils.createElement('span', `sync-status-value ${syncResult}`, {}, 
      Settings.getSyncStatusText(syncResult));
    statusDisplay.append(statusLabel, statusValue);
    
    container.append(modeDisplay, timeDisplay, statusDisplay);
    return container;
  },

  /**
   * 获取同步状态文本
   * @param {string} status - 状态值
   * @returns {string} - 状态文本
   */
  getSyncStatusText(status) {
    const statusTexts = {
      'none': I18n.getMessage('syncStatusNone', '未同步'),
      'success': I18n.getMessage('syncStatusSuccess', '成功'),
      'error': I18n.getMessage('syncStatusError', '失败'),
      'uploading': I18n.getMessage('syncStatusUploading', '上传中'),
      'downloading': I18n.getMessage('syncStatusDownloading', '下载中')
    };
    return statusTexts[status] || status;
  },

  /**
   * 创建同步操作面板
   * @returns {HTMLElement} - 同步操作面板
   */
  createSyncActionsPanel() {
    const container = Utils.createElement('div', 'sync-actions-container');
    
    // 测试连接按钮
    const testBtn = Utils.createElement('button', 'btn btn-secondary sync-test-btn', {}, 
      I18n.getMessage('testConnection', '测试连接'));
    testBtn.addEventListener('click', () => Settings.testSyncConnection());
    
    // 立即上传按钮
    const uploadBtn = Utils.createElement('button', 'btn btn-primary sync-upload-btn', {}, 
      I18n.getMessage('uploadNow', '立即上传'));
    uploadBtn.addEventListener('click', () => Settings.performSync('upload', false));
    
    // 立即下载按钮
    const downloadBtn = Utils.createElement('button', 'btn btn-info sync-download-btn', {}, 
      I18n.getMessage('downloadNow', '立即下载'));
    downloadBtn.addEventListener('click', () => Settings.performSync('download', false));
    
    const buttonGroup = Utils.createElement('div', 'sync-button-group');
    buttonGroup.append(testBtn, uploadBtn, downloadBtn);
    
    container.appendChild(buttonGroup);
    return container;
  },

  /**
   * 刷新同步状态显示
   */
  refreshSyncStatus() {
    const statusContainer = document.querySelector('.sync-status-container');
    if (statusContainer) {
      const newStatus = Settings.createSyncStatusDisplay();
      statusContainer.parentNode.replaceChild(newStatus, statusContainer);
    }
  },

  /**
   * 测试同步连接
   */
  async testSyncConnection() {
    const testBtn = document.querySelector('.sync-test-btn');
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = I18n.getMessage('testing', '测试中...');
    }
    
    try {
      // 这里应该调用实际的连接测试API
      // 模拟连接测试
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      Notification.notify({
        title: I18n.getMessage('connectionTest', '连接测试'),
        message: I18n.getMessage('connectionSuccess', '连接成功'),
        type: 'success',
        duration: 2000
      });
    } catch (error) {
      console.error('连接测试失败:', error);
      Notification.notify({
        title: I18n.getMessage('connectionTest', '连接测试'),
        message: I18n.getMessage('connectionFailed', '连接失败'),
        type: 'error',
        duration: 3000
      });
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = I18n.getMessage('testConnection', '测试连接');
      }
    }
  },

  /**
   * 执行同步操作
   * @param {string} direction - 同步方向 ('upload' | 'download')
   * @param {boolean} silent - 是否静默执行
   */
  async performSync(direction, silent = false) {
    const isUpload = direction === 'upload';
    const btnSelector = isUpload ? '.sync-upload-btn' : '.sync-download-btn';
    const btn = document.querySelector(btnSelector);
    
    // 更新按钮状态
    if (btn) {
      btn.disabled = true;
      btn.textContent = isUpload ? 
        I18n.getMessage('uploading', '上传中...') : 
        I18n.getMessage('downloading', '下载中...');
    }
    
    // 更新同步状态
    const status = isUpload ? 'uploading' : 'downloading';
    localStorage.setItem('last-sync-result', status);
    Settings.refreshSyncStatus();
    
    try {
      // 获取当前数据
      const currentData = Settings.getAllSettingsData();
      
      if (isUpload) {
        // 上传数据到云端
        await Settings.uploadData(currentData);
        if (!silent) {
          Notification.notify({
            title: I18n.getMessage('uploadSuccess', '上传成功'),
            message: I18n.getMessage('dataUploadedSuccess', '数据已成功上传到云端'),
            type: 'success',
            duration: 2000
          });
        }
      } else {
        // 从云端下载数据
        const cloudData = await Settings.downloadData();
        await Settings.applySettingsData(cloudData);
        if (!silent) {
          Notification.notify({
            title: I18n.getMessage('downloadSuccess', '下载成功'),
            message: I18n.getMessage('dataDownloadedSuccess', '数据已成功从云端下载'),
            type: 'success',
            duration: 2000
          });
        }
      }
      
      // 记录成功状态
      localStorage.setItem('last-sync-result', 'success');
      localStorage.setItem('last-sync-time', Date.now().toString());
      
    } catch (error) {
      console.error('同步失败:', error);
      localStorage.setItem('last-sync-result', 'error');
      
      if (!silent) {
        Notification.notify({
          title: I18n.getMessage('syncFailed', '同步失败'),
          message: error.message || I18n.getMessage('syncError', '同步过程中发生错误'),
          type: 'error',
          duration: 3000
        });
      }
    } finally {
      // 恢复按钮状态
      if (btn) {
        btn.disabled = false;
        btn.textContent = isUpload ? 
          I18n.getMessage('uploadNow', '立即上传') : 
          I18n.getMessage('downloadNow', '立即下载');
      }
      
      // 刷新状态显示
      Settings.refreshSyncStatus();
    }
  },

    /**
   * 获取所有设置数据
   * @returns {Object} - 设置数据对象
   */
  getAllSettingsData() {
    const data = {};
    
    // 收集localStorage中的设置数据
    const settingKeys = [
      'theme', 'language', 'sync-mode', 'sync-interval',
      'search-engines', 'bookmarks'
    ];
    
    settingKeys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      }
    });
    
    // 收集网格系统设置（从模块实例获取实际状态）
    if (window.GridSystem) {
      data['grid-enabled'] = GridSystem.gridEnabled;
      data['grid-debug'] = GridSystem.isDebugMode;
      data['grid-snap-threshold'] = GridSystem.snapThreshold;
    } else {
      // 如果GridSystem未初始化，从localStorage获取
      data['grid-enabled'] = localStorage.getItem('grid-enabled') === 'true';
      data['grid-debug'] = localStorage.getItem('grid-debug') === 'true';
      data['grid-snap-threshold'] = parseInt(localStorage.getItem('grid-snap-threshold')) || 15;
    }
    
    // 收集AI设置（从模块实例获取实际状态）
    if (window.AI) {
      const aiConfig = AI.getConfig();
      data['ai-enabled'] = aiConfig.enabled;
      data['ai-config'] = aiConfig;
    } else {
      // 如果AI未初始化，从localStorage获取
      data['ai-enabled'] = localStorage.getItem('ai-enabled') === 'true';
      const aiConfigStr = localStorage.getItem('ai-config');
      if (aiConfigStr) {
        try {
          data['ai-config'] = JSON.parse(aiConfigStr);
        } catch {
          data['ai-config'] = null;
        }
      }
    }
    
    data.timestamp = Date.now();
    return data;
  },
  
  /**
   * 应用设置数据
   * @param {Object} data - 设置数据
   */
  async applySettingsData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error(I18n.getMessage('invalidSyncData', '无效的同步数据'));
    }
    
    console.log('开始应用同步数据:', data);
    
    // 首先将所有数据保存到localStorage
    Object.keys(data).forEach(key => {
      if (key !== 'timestamp') {
        const value = typeof data[key] === 'object' ? 
          JSON.stringify(data[key]) : String(data[key]);
        localStorage.setItem(key, value);
        console.log(`保存设置 ${key}:`, value);
      }
    });
    
    // 立即应用网格系统设置
    if (window.GridSystem) {
      if ('grid-enabled' in data) {
        await GridSystem.toggleGridSystem(Boolean(data['grid-enabled']));
        console.log('应用网格启用状态:', data['grid-enabled']);
      }
      
      if ('grid-debug' in data) {
        await GridSystem.toggleGridDebug(Boolean(data['grid-debug']));
        console.log('应用网格调试状态:', data['grid-debug']);
      }
      
      if ('grid-snap-threshold' in data) {
        GridSystem.setSnapThreshold(Number(data['grid-snap-threshold']));
        console.log('应用网格吸附阈值:', data['grid-snap-threshold']);
      }
    }
    
    // 立即应用AI设置
    if (window.AI && data['ai-config']) {
      await AI.updateConfig(data['ai-config']);
      console.log('应用AI配置:', data['ai-config']);
    }
    
    // 立即应用主题设置
    if (data.theme) {
      Settings.applyTheme(data.theme);
      console.log('应用主题:', data.theme);
    }
    
    // 语言设置需要刷新页面
    const needsReload = data.language && data.language !== I18n.getCurrentLanguage();
    
    if (needsReload) {
      await I18n.changeLanguage(data.language);
      console.log('语言已更改，准备刷新页面');
      
      // 显示提示并刷新页面
      Notification.notify({
        title: I18n.getMessage('settingsApplied', '设置已应用'),
        message: I18n.getMessage('pageWillReload', '页面将在2秒后刷新以应用所有设置'),
        type: 'success',
        duration: 2000
      });
      
      setTimeout(() => location.reload(), 2000);
    } else {
      // 如果不需要刷新页面，刷新设置面板显示
      setTimeout(() => {
        Settings.syncSettingsWithSystem();
        
        Notification.notify({
          title: I18n.getMessage('settingsApplied', '设置已应用'),
          message: I18n.getMessage('syncDataAppliedSuccess', '同步数据已成功应用'),
          type: 'success',
          duration: 2000
        });
      }, 500);
    }
  },
  
  /**
   * 改进设置同步方法 - 确保从实际模块状态同步
   */
  syncSettingsWithSystem() {
    console.log('开始同步设置与系统状态');
    
    try {
      // 同步网格系统设置
      const gridEnabledCheckbox = document.getElementById('grid-enabled');
      const gridDebugCheckbox = document.getElementById('grid-debug');
      const gridSnapThresholdRange = document.getElementById('grid-snap-threshold');
      
      if (window.GridSystem) {
        if (gridEnabledCheckbox) {
          const currentEnabled = GridSystem.gridEnabled;
          gridEnabledCheckbox.checked = currentEnabled;
          console.log('同步网格启用状态:', currentEnabled);
        }
        
        if (gridDebugCheckbox) {
          const currentDebug = GridSystem.isDebugMode;
          gridDebugCheckbox.checked = currentDebug;
          console.log('同步网格调试状态:', currentDebug);
        }
        
        if (gridSnapThresholdRange) {
          const currentThreshold = GridSystem.snapThreshold;
          gridSnapThresholdRange.value = currentThreshold;
          const rangeValue = gridSnapThresholdRange.parentElement?.querySelector('.range-value');
          if (rangeValue) {
            rangeValue.textContent = `${currentThreshold}px`;
          }
          console.log('同步网格吸附阈值:', currentThreshold);
        }
      } else {
        // 如果GridSystem未初始化，从localStorage读取并应用
        if (gridEnabledCheckbox) {
          const storedEnabled = localStorage.getItem('grid-enabled') === 'true';
          gridEnabledCheckbox.checked = storedEnabled;
          console.log('从localStorage同步网格启用状态:', storedEnabled);
        }
        
        if (gridDebugCheckbox) {
          const storedDebug = localStorage.getItem('grid-debug') === 'true';
          gridDebugCheckbox.checked = storedDebug;
          console.log('从localStorage同步网格调试状态:', storedDebug);
        }
        
        if (gridSnapThresholdRange) {
          const storedThreshold = parseInt(localStorage.getItem('grid-snap-threshold')) || 15;
          gridSnapThresholdRange.value = storedThreshold;
          const rangeValue = gridSnapThresholdRange.parentElement?.querySelector('.range-value');
          if (rangeValue) {
            rangeValue.textContent = `${storedThreshold}px`;
          }
          console.log('从localStorage同步网格吸附阈值:', storedThreshold);
        }
      }
      
      // 同步AI设置
      const aiEnabledCheckbox = document.getElementById('ai-enabled');
      if (window.AI && aiEnabledCheckbox) {
        const currentAIEnabled = AI.getConfig().enabled;
        aiEnabledCheckbox.checked = currentAIEnabled;
        console.log('同步AI启用状态:', currentAIEnabled);
      } else if (aiEnabledCheckbox) {
        const storedAIEnabled = localStorage.getItem('ai-enabled') === 'true';
        aiEnabledCheckbox.checked = storedAIEnabled;
        console.log('从localStorage同步AI启用状态:', storedAIEnabled);
      }
      
      // 同步其他localStorage设置
      this.syncLocalStorageSettings();
      
      console.log('设置同步完成');
    } catch (error) {
      console.error('同步设置失败:', error);
    }
  },
  
  /**
   * 同步localStorage中的设置
   */
  syncLocalStorageSettings() {
    // 同步数据同步设置
    const syncModeRadios = document.getElementsByName('sync-mode');
    if (syncModeRadios.length > 0) {
      const currentSyncMode = localStorage.getItem('sync-mode') || 'disabled';
      syncModeRadios.forEach(radio => {
        radio.checked = radio.value === currentSyncMode;
      });
      console.log('同步设置 - 同步模式:', currentSyncMode);
    }
    
    const syncIntervalSelect = document.getElementById('sync-interval');
    if (syncIntervalSelect) {
      const currentSyncInterval = localStorage.getItem('sync-interval') || '0';
      syncIntervalSelect.value = currentSyncInterval;
      console.log('同步设置 - 自动同步间隔:', currentSyncInterval);
    }
    
    // 同步主题设置
    const themeRadios = document.getElementsByName('theme');
    if (themeRadios.length > 0) {
      const currentTheme = localStorage.getItem('theme') || 'auto';
      themeRadios.forEach(radio => {
        radio.checked = radio.value === currentTheme;
      });
      console.log('同步设置 - 主题:', currentTheme);
    }
    
    // 同步语言设置
    const languageSelect = document.getElementById('language');
    if (languageSelect) {
      const currentLanguage = localStorage.getItem('language') || 'zh';
      languageSelect.value = currentLanguage;
      console.log('同步设置 - 语言:', currentLanguage);
    }
  },

  /**
   * 上传数据到云端
   * @param {Object} data - 要上传的数据
   */
  async uploadData(data) {
    // 模拟上传API调用
    // 实际实现应该调用真实的云存储API
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // 模拟上传成功
        localStorage.setItem('cloud-backup', JSON.stringify(data));
        resolve();
      }, 1000);
    });
  },

  /**
   * 从云端下载数据
   * @returns {Object} - 下载的数据
   */
  async downloadData() {
    // 模拟下载API调用
    // 实际实现应该调用真实的云存储API
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const cloudData = localStorage.getItem('cloud-backup');
        if (cloudData) {
          try {
            resolve(JSON.parse(cloudData));
          } catch (error) {
            reject(new Error(I18n.getMessage('parseCloudDataError', '解析云端数据失败')));
          }
        } else {
          reject(new Error(I18n.getMessage('noCloudDataFound', '未找到云端数据')));
        }
      }, 1000);
    });
  },

  /**
   * 开始自动同步
   */
  startAutoSync() {
    // 清除现有的定时器
    if (Settings._autoSyncTimer) {
      clearInterval(Settings._autoSyncTimer);
    }
    
    const syncMode = localStorage.getItem('sync-mode');
    const syncInterval = parseInt(localStorage.getItem('sync-interval') || '0');
    
    if (syncMode !== 'disabled' && syncInterval > 0) {
      Settings._autoSyncTimer = setInterval(() => {
        Settings.performSync(syncMode, true); // 静默同步
      }, syncInterval * 1000);
      
      console.log(`自动同步已启动，模式: ${syncMode}，间隔: ${syncInterval}秒`);
    }
  },

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (Settings._autoSyncTimer) {
      clearInterval(Settings._autoSyncTimer);
      Settings._autoSyncTimer = null;
      console.log('自动同步已停止');
    }
  },

  // ...existing code...
};
// 页面加载时启动自动同步
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const syncMode = localStorage.getItem('sync-mode');
    if (syncMode && syncMode !== 'disabled') {
      Settings.startAutoSync();
      
      // 页面加载后2秒执行一次静默同步
      setTimeout(() => {
        Settings.performSync(syncMode, true);
      }, 2000);
    }
  }, 100);
});