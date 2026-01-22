/**
 * 设置面板主模块
 * 负责生成各类设置项、处理设置逻辑、开发者选项等
 * @module Settings
 */
import {
    Menu,
    Utils,
    GridSystem,
    I18n,
    SearchEngineAPI,
    Notification,
    IconManager,
    AI,
    DataSync,
    ThemeManager,
    NotificationManager
} from './core/index.js';

// 全局 modal ID 常量
const SETTINGS_MODAL_ID = 'settings-modal';

export const Settings = {
  /**
   * 是否已解锁开发者模式
   * @type {boolean}
   */
  developerUnlocked: false,
  /**
   * 解锁开发者模式所需点击次数
   * @type {number}
   */
  unlockClicks: 0,
  /**
   * 是否启用调试模式
   * @type {boolean}
   */
  debugEnabled: false,
  /**
   * 获取所有设置分类（支持国际化）
   * @returns {Array} 设置分类数组
   */
  getCategories: () => {
    const categories = [
        {
          id: 'general',
          icon: '\uE713',
          title: I18n.getMessage('settingsGeneral', '常规设置'),      items: [
             ...I18n.createSettingsItems(),
             ...ThemeManager.createSettingsItems()
          ]
        },
        {
          id: 'notifications',
          icon: '\uE700',
          title: I18n.getMessage('settingsNotifications', '通知设置'),
          items: NotificationManager.createSettingsItems()
        },
        {
          id: 'ai-assistant',
          icon: '\uE901',
          title: I18n.getMessage('settingsAI', 'AI助手'),
          items: window.AI ? window.AI.createSettingsItems() : []    },
        {
          id: 'search-engines',
          icon: '\uE721',
          title: I18n.getMessage('settingsSearchEngines', '搜索引擎'),
          items: SearchEngineAPI ? SearchEngineAPI.createSettingsItems() : []
        },
        DataSync.getSettingsCategory(),
        // 关于页
        {
          id: 'about',
          icon: '\uE946',
          title: I18n.getMessage('settingsAbout', '关于'),
          items: [
            {
              id: 'version',
              label: I18n.getMessage('settingsVersion', '版本号'),
              type: 'custom',
              async createControl() {
                const span = Utils.createElement('span', 'setting-text', {}, window.VERSION);
                return span;
              }
            },
            {
              id: 'openRepo',
              label: I18n.getMessage('settingsOpenRepo', 'github开源地址'),
              type: 'button',
              buttonText: 'GitHub',
              buttonClass: 'btn-secondary',
              onClick: () => window.open('https://github.com/xzy-nine/newtab', '_blank')
            },
            {
              id: 'openStore',
              label: I18n.getMessage('settingsOpenStore', 'edge商店地址'),
              type: 'button',
              buttonText: '商店',
              buttonClass: 'btn-secondary',
              onClick: () => window.open('https://microsoftedge.microsoft.com/addons/detail/lpdhbhkcbnhldcpcbocplhgeooabhbme', '_blank')
            },
          ]
        },
        // 开发者选项，初始隐藏
        {
          id: 'developer',
          icon: '\uE713',
          title: I18n.getMessage('settingsDeveloper', '开发者选项'),
          items: [
            {
              id: 'grid-debug',
              label: I18n.getMessage('settingsGridDebug', '显示网格线'),
              type: 'checkbox',
              getValue: () => window.GridSystem.isDebugMode,
              description: I18n.getMessage('settingsGridDebugDesc', '显示网格辅助线，帮助对齐元素'),
              onChange: async (v) => { window.GridSystem.toggleGridDebug(v); }
            },
            {
              id: 'openDev',
              label: I18n.getMessage('settingsOpenDev', 'Microsoft 合作伙伴中心'),
              type: 'button',
              buttonText: '合作伙伴中心',
              buttonClass: 'btn-secondary',
              onClick: () => window.open('https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview', '_blank')
            },
            {
              id: 'debugMode',
              label: I18n.getMessage('settingsDebugMode', '调试模式'),
              type: 'checkbox',
              getValue: () => Settings.debugEnabled,
              description: I18n.getMessage('settingsDebugModeDesc', '其他模块将进入调试模式,增加信息显示和部分日志输出'),
              onChange: async (value) => {
                Settings.debugEnabled = value;
                window.DEBUG_MODE = value;
                // 持久化调试模式状态
                localStorage.setItem('debugEnabled', value);
              }
            },
            {
              id: 'clearSearchData',
              label: I18n.getMessage('settingsClearSearchData', '清除拓展全部数据'),
              type: 'button',
              buttonText: I18n.getMessage('settingsClearSearchDataBtn', '清除拓展全部数据'),
              buttonClass: 'btn-warning',
              onClick: () => {
                Notification.notify({
                  title: I18n.getMessage('confirm', '确认'),
                  message: I18n.getMessage('clearStorageConfirm', '确定要清除所有存储数据吗？此操作不可恢复。'),
                  duration: 0,
                  type: 'confirm',
                  buttons: [
                    {
                      text: I18n.getMessage('confirm', '确认'),
                      class: 'btn-primary confirm-yes',
                      callback: async () => {
                         // 直接清除所有 localStorage，为后续功能保留清除入口
                         localStorage.clear();
                           const success = await SearchEngineAPI.clearStorage();
                           if (success) {
                             Notification.notify({
                               title: I18n.getMessage('success', '成功'),
                               message: I18n.getMessage('clearStorageSuccess', '存储已成功清除，页面将刷新。'),
                               type: 'success',
                               duration: 1500,
                               onClose: () => window.location.reload()
                             });
                           } else {
                             Notification.notify({
                               title: I18n.getMessage('error', '错误'),
                               message: I18n.getMessage('clearStorageError', '清除存储失败'),
                               type: 'error',
                               duration: 3000
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
              }
            }
          ]
        }
      ];
    return categories.filter(cat => cat.id !== 'developer' || Settings.developerUnlocked);
  },

  currentCategory: 'general',

  open: () => {
    Settings.showSettingsModal();
  },

  showSettingsModal: () => {
    Settings.unlockClicks = 0;
    // 从本地存储恢复开发者选项及调试模式状态
    Settings.developerUnlocked = localStorage.getItem('developerUnlocked') === 'true';
    Settings.debugEnabled = localStorage.getItem('debugEnabled') === 'true';
    window.DEBUG_MODE = Settings.debugEnabled;
     // 使用全局常量作为 modal ID
     const modalId = SETTINGS_MODAL_ID;
     // 删除旧的模态框
     const oldModal = document.getElementById(SETTINGS_MODAL_ID);
     if (oldModal) {
       oldModal.remove();
     }

     // 创建模态框
     const modal = Utils.createElement('div', 'modal settings-modal', { id: SETTINGS_MODAL_ID });
     modal.style.userSelect = 'none';
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
    Settings.bindEvents(SETTINGS_MODAL_ID);
    
    // 显示模态框后同步设置
    setTimeout(() => {
      Settings.syncSettingsWithSystem();
    }, 100);
      // 监听外部设置变化
    const syncHandler = () => Settings.syncSettingsWithSystem();
    window.addEventListener('gridSettingsChanged', syncHandler);
    window.addEventListener('dataSyncSettingsChanged', syncHandler);
    
    // 监听同步状态更新事件
    const syncStatusHandler = () => {
      if (typeof DataSync !== 'undefined' && DataSync.updateSyncStatusDisplay) {
        setTimeout(() => {
          DataSync.updateSyncStatusDisplay();
          console.log('响应同步状态更新事件');
        }, 100);
      }
    };
    window.addEventListener('syncStatusUpdated', syncStatusHandler);
    
    // 模态框关闭时移除监听器
    const modalElement = document.getElementById(SETTINGS_MODAL_ID);
    const originalHide = Menu.Modal.hide;
    Menu.Modal.hide = function(id) {
      if (id === SETTINGS_MODAL_ID) {
        window.removeEventListener('gridSettingsChanged', syncHandler);
        window.removeEventListener('dataSyncSettingsChanged', syncHandler);
        window.removeEventListener('syncStatusUpdated', syncStatusHandler);
        Menu.Modal.hide = originalHide; // 恢复原方法
      }
      return originalHide.call(this, id);
    };
    
    // 显示模态框
    Menu.Modal.show(SETTINGS_MODAL_ID);
    
    // 延迟更新同步状态显示，确保模态框完全加载后再更新
    setTimeout(() => {
      if (typeof DataSync !== 'undefined' && DataSync.updateSyncStatusDisplay) {
        DataSync.updateSyncStatusDisplay();
        console.log('设置模态框打开后更新同步状态显示');
      }
    }, 300);
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
    
    // 如果是数据同步分类，需要更新同步状态显示
    if (categoryId === 'data-sync') {
      setTimeout(() => {
        if (typeof DataSync !== 'undefined' && DataSync.updateSyncStatusDisplay) {
          DataSync.updateSyncStatusDisplay();
          console.log('数据同步分类渲染后更新同步状态显示');
        }
      }, 200);
    }
  },

  createSettingItem: async (item) => {
const itemElement = Utils.createElement('div', 'setting-item');
if (Settings.currentCategory === 'about') {
  itemElement.style.userSelect = 'none';
}
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
        
        // 如果没有提供getValue方法，使用默认值
        return item.value || item.defaultValue || '';
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
          // 优先使用模块提供的 onChange 回调
        if (typeof item.onChange === 'function') {
          checkbox.addEventListener('change', async (e) => {
            const value = e.target.checked;
            console.log(`设置项 ${item.id} 变更:`, value);
            
            try {
              await item.onChange(value);
              
              // 同步显示状态
              setTimeout(() => {
                const latestValue = getCurrentValue();
                checkbox.checked = latestValue;
                console.log(`设置项 ${item.id} 状态同步后:`, latestValue);
              }, 100);
            } catch (error) {
              console.error(`处理设置项 ${item.id} 变更失败:`, error);
              // 恢复原状态
              checkbox.checked = !value;
            }          });        }
        
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
        
        // 如果是只读模式，禁用滑块
        if (item.readonly) {
          range.disabled = true;
          range.style.opacity = '0.6';
        }
        
        // 格式化显示值 - 支持秒数显示
        const formatValue = (value) => {
          if (item.id.startsWith('notification-duration-')) {
            // 对于通知时间，显示为"X.X秒"格式
            return `${parseFloat(value).toFixed(1)}${item.unit || ''}`;
          }
          return `${value}${item.unit || ''}`;
        };
        
        const rangeValue = Utils.createElement('span', 'range-value', {}, formatValue(currentValue));
        
        // 创建按钮容器
        const rangeButtons = Utils.createElement('div', 'range-buttons');
          // 添加测试按钮
        if (item.testButton) {
          const testBtn = NotificationManager.createTestButton(item.testType || 'info');
          rangeButtons.appendChild(testBtn);
        }
        
        // 添加恢复默认按钮
        if (item.resetButton && typeof item.defaultValue !== 'undefined') {
          const resetBtn = NotificationManager.createResetButton(item.id, item.defaultValue);
          rangeButtons.appendChild(resetBtn);
        }
        
        rangeContainer.append(range, rangeValue);
        
        // 如果有按钮，添加按钮容器
        if (rangeButtons.children.length > 0) {
          rangeContainer.appendChild(rangeButtons);
        }
        
        itemControl.appendChild(rangeContainer);        // 更新显示值和实际值
        range.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value);
          rangeValue.textContent = formatValue(value);
          
          // 优先使用模块提供的 onChange 回调
          if (typeof item.onChange === 'function') {
            try {
              item.onChange(value);
              console.log(`设置项 ${item.id} 变更:`, value);            } catch (error) {
              console.error(`处理设置项 ${item.id} 变更失败:`, error);
            }
          }
        });
        
        // 监听外部变化并同步界面
        const syncRangeValue = () => {
          const latestValue = getCurrentValue();
          if (range.value !== latestValue.toString()) {
            range.value = latestValue;
            rangeValue.textContent = formatValue(latestValue);
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
        
        // 如果设置项提供了onChange回调，使用它
        if (typeof item.onChange === 'function') {
          select.addEventListener('change', async (e) => {
            try {
              await item.onChange(e.target.value);
            } catch (error) {
              console.error(`处理设置项 ${item.id} 变更失败:`, error);
            }
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
          radioGroup.appendChild(radioContainer);        });
        
        // 如果设置项提供了onChange回调，使用它
        if (typeof item.onChange === 'function') {
          radioGroup.addEventListener('change', (e) => {
            if (e.target.type === 'radio') {
              try {
                item.onChange(e.target.value);
              } catch (error) {
                console.error(`处理设置项 ${item.id} 变更失败:`, error);
              }
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
          // 优先使用模块提供的 onChange 回调
        if (typeof item.onChange === 'function') {
          textInput.addEventListener('change', (e) => {
            try {
              item.onChange(e.target.value);
            } catch (error) {
              console.error(`处理设置项 ${item.id} 变更失败:`, error);
            }
          });        }
        
        itemControl.appendChild(textInput);
        break;
        
      case 'password':
        const passwordInput = Utils.createElement('input', 'setting-input', {
          type: 'password',
          id: item.id,
          value: currentValue || '',
          placeholder: item.placeholder || ''
        });
          // 优先使用模块提供的 onChange 回调
        if (typeof item.onChange === 'function') {
          passwordInput.addEventListener('change', (e) => {
            try {
              item.onChange(e.target.value);
            } catch (error) {
              console.error(`处理设置项 ${item.id} 变更失败:`, error);
            }
          });        }
        
        itemControl.appendChild(passwordInput);
        break;
        
      case 'textarea':
        const textarea = Utils.createElement('textarea', 'setting-textarea', {
          id: item.id,
          rows: item.rows || 4,
          placeholder: item.placeholder || ''
        });
        textarea.value = currentValue || '';
          // 优先使用模块提供的 onChange 回调
        if (typeof item.onChange === 'function') {
          textarea.addEventListener('change', (e) => {
            try {
              item.onChange(e.target.value);
            } catch (error) {
              console.error(`处理设置项 ${item.id} 变更失败:`, error);
            }
          });        }
        
        itemControl.appendChild(textarea);
        break;
        
      case 'custom':
        if (typeof item.createControl === 'function') {
          try {
            const customControl = await item.createControl();
            if (item.id === 'version') {
              customControl.id = 'versionText';
              customControl.style.cursor = Settings.developerUnlocked ? 'default' : 'pointer';
              customControl.addEventListener('click', () => {
                if (Settings.developerUnlocked) return;  // 解锁后禁用点击
                Settings.unlockClicks++;
                if (Settings.unlockClicks >= 5) {
                  Settings.developerUnlocked = true;
                  // 持久化开发者选项解锁状态
                  localStorage.setItem('developerUnlocked', 'true');
                  
                  Notification.notify({
                    message: I18n.getMessage('developerUnlocked', '开发者选项已解锁'),
                    type: 'success'
                  });
                  customControl.style.cursor = 'default'; // 取消可点击指针样式
                  // 实时重建侧栏
                  const sidebar = document.querySelector('#settings-modal .settings-sidebar');
                  sidebar.innerHTML = '';
                  Settings.getCategories().forEach(cat => {
                    const catElem = Utils.createElement('div',
                      `settings-category ${cat.id === 'developer' ? 'active' : ''}`,
                      { 'data-category': cat.id }
                    );
                    catElem.append(
                      Utils.createElement('span', 'category-icon', {}, cat.icon),
                      Utils.createElement('span', 'category-text', {}, cat.title)
                    );
                    sidebar.appendChild(catElem);
                  });
                  // 切换到开发者分类并渲染内容
                  Settings.currentCategory = 'developer';
                  Settings.renderCategoryContent(Settings.currentCategory);
                  // 重新绑定事件以确保侧栏可点击
                  Settings.bindEvents();
                }
              });
            }
            if (customControl) {
              itemControl.appendChild(customControl);
            }
          } catch (error) {
            console.error(`创建自定义控件 ${item.id} 失败:`, error);
          }
        }
        break;
        
      case 'button':
        const button = Utils.createElement('button', `btn ${item.buttonClass || 'btn-primary'}`, {
          id: item.id,
          type: 'button'
        }, item.buttonText || item.label);
          // 优先使用模块提供的 onClick 回调
        if (typeof item.onClick === 'function') {
          button.addEventListener('click', () => {
            try {
              item.onClick();
            } catch (error) {
              console.error(`执行按钮 ${item.id} 回调失败:`, error);
            }
          });        }
        
        itemControl.appendChild(button);
        break;
    }
    
    itemElement.append(itemHeader, itemControl);
    return itemElement;  },  
  // 改进设置同步方法
  syncSettingsWithSystem() {
    console.log('开始同步设置与系统状态');
    
    try {
      // 获取当前显示的设置项并同步它们的值
      const settingItems = document.querySelectorAll('.setting-item');
      
      settingItems.forEach(itemElement => {
        const settingControl = itemElement.querySelector('.setting-control');
        if (!settingControl) return;
        
        // 查找控件元素
        const checkbox = settingControl.querySelector('input[type="checkbox"]');
        const range = settingControl.querySelector('input[type="range"]');
        const select = settingControl.querySelector('select');
        const textarea = settingControl.querySelector('textarea');
        const textInput = settingControl.querySelector('input[type="text"]');
        
        // 从设置项配置中获取当前值的方法
        const settingId = checkbox?.id || range?.id || select?.id || textarea?.id || textInput?.id;
        if (!settingId) return;
        
        // 找到对应的设置项配置
        const categories = Settings.getCategories();
        let itemConfig = null;
        
        for (const category of categories) {
          itemConfig = category.items.find(item => item.id === settingId);
          if (itemConfig) break;
        }
        
        if (!itemConfig || typeof itemConfig.getValue !== 'function') return;
        
        try {
          const currentValue = itemConfig.getValue();
          
          // 根据控件类型同步值
          if (checkbox) {
            checkbox.checked = Boolean(currentValue);
          } else if (range) {
            range.value = currentValue;
            const rangeValue = settingControl.querySelector('.range-value');
            if (rangeValue && itemConfig.unit) {
              rangeValue.textContent = `${currentValue}${itemConfig.unit}`;
            }
          } else if (select) {
            select.value = currentValue;
          } else if (textarea) {
            textarea.value = currentValue || '';
          } else if (textInput) {
            textInput.value = currentValue || '';
          }
          
          console.log(`同步设置项 ${settingId}:`, currentValue);
        } catch (error) {
          console.warn(`同步设置项 ${settingId} 失败:`, error);
        }
      });
      
      console.log('设置同步完成');
    } catch (error) {
      console.error('同步设置失败:', error);
    }
  },

  bindEvents: () => {
    // 绑定关闭按钮事件
    const closeBtn = document.querySelector(`#${SETTINGS_MODAL_ID} .modal-close`);
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        Menu.Modal.hide(SETTINGS_MODAL_ID);
      });
    }

    // 分类切换
    const categoryItems = document.querySelectorAll(`#${SETTINGS_MODAL_ID} .settings-category`);
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

    // 点击外部关闭
    const modal = document.getElementById(SETTINGS_MODAL_ID);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          Menu.Modal.hide(SETTINGS_MODAL_ID);
        }
      });
    }

    // 绑定 ESC 关闭
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        Menu.Modal.hide(SETTINGS_MODAL_ID);
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    document.addEventListener('keydown', handleEscKey);
  },
};