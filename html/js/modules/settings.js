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

export const Settings = {
  // 设置配置 - 改为函数以支持动态翻译
  getCategories: () => [
    {
      id: 'general',
      icon: '⚙️',
      title: I18n.getMessage('settingsGeneral', '常规设置'),      items: [
        {
          id: 'language',
          label: I18n.getMessage('settingsLanguage', '界面语言'),
          type: 'select',
          options: [
            { value: 'zh', label: '简体中文' },
            { value: 'en', label: 'English' }
          ],
          getValue: () => I18n.getCurrentLanguage(),
          description: I18n.getMessage('settingsLanguageDesc', '选择界面显示语言'),
          onChange: async (value) => {
            await Settings.handleLanguageChange(value);
          }
        },
        ...ThemeManager.createSettingsItems()
      ]
    },
    {
      id: 'notifications',
      icon: '🔔',
      title: I18n.getMessage('settingsNotifications', '通知设置'),
      items: NotificationManager.createSettingsItems()
    },
    {
      id: 'grid-system',
      icon: '📐',
      title: I18n.getMessage('settingsGridSystem', '网格系统'),
      items: window.GridSystem ? window.GridSystem.createSettingsItems() : []
    },
    {
      id: 'ai-assistant',
      icon: '🤖',
      title: I18n.getMessage('settingsAI', 'AI助手'),
      items: window.AI ? window.AI.createSettingsItems() : []    },
    {
      id: 'search-engines',
      icon: '🔍',
      title: I18n.getMessage('settingsSearchEngines', '搜索引擎'),
      items: SearchEngineAPI ? SearchEngineAPI.createSettingsItems() : []
    },
    {
      id: 'data-sync',
      icon: '☁️',
      title: I18n.getMessage('settingsDataSync', '数据同步'),
      items: DataSync.createSettingsItems()
    },
    // 关于页
    {
      id: 'about',
      icon: 'ℹ️',
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
        {
          id: 'openDev',
          label: I18n.getMessage('settingsOpenDev', 'edge的开发者页面'),
          type: 'button',
          buttonText: '开发者',
          buttonClass: 'btn-secondary',
          onClick: () => window.open('https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview', '_blank')
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
    window.addEventListener('dataSyncSettingsChanged', syncHandler);
    
    // 模态框关闭时移除监听器
    const settingsModal = document.getElementById(modalId); // 重命名变量避免冲突
    const originalHide = Menu.Modal.hide;
    Menu.Modal.hide = function(id) {
      if (id === modalId) {
        window.removeEventListener('gridSettingsChanged', syncHandler);
        window.removeEventListener('dataSyncSettingsChanged', syncHandler);
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
        
      case 'custom':        // 优先使用模块提供的 createControl 方法
        if (typeof item.createControl === 'function') {
          try {
            const customControl = await item.createControl();
            if (customControl) {
              itemControl.appendChild(customControl);
            }
          } catch (error) {
            console.error(`创建自定义控件 ${item.id} 失败:`, error);
          }        }
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
    return itemElement;  },  // AI供应商相关方法已移动到AI模块中
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
    }    // 绑定ESC键关闭事件
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        Menu.Modal.hide(modalId);
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    document.addEventListener('keydown', handleEscKey);  },
  /**
   * 优化的设置同步方法 - 使用模块的 getValue 方法
   */
  

  /**
   * 处理语言变化
   * @param {string} selectedLanguage - 选择的语言
   */
  async handleLanguageChange(selectedLanguage) {
    const currentLanguage = I18n.getCurrentLanguage();
    
    console.log(`语言切换: ${currentLanguage} -> ${selectedLanguage}`);
    
    // 如果选择的语言与当前语言相同，不执行操作
    if (selectedLanguage === currentLanguage) {
      console.log('选择的语言与当前语言相同，跳过操作');
      return;
    }
    
    try {
      // 显示切换中的通知
      Notification.notify({
        title: I18n.getMessage('switchingLanguage', '正在切换语言'),
        message: I18n.getMessage('pleaseWait', '请稍候...'),
        type: 'info',
        duration: 1000
      });
      
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
        const select = document.getElementById('language');
        if (select) {
          select.value = I18n.getCurrentLanguage();
        }
      }
  },
};