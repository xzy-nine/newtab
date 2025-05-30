import { Menu } from './menu.js';
import { Utils } from './utils.js';
import { I18n } from './i18n.js';
import { SearchEngineAPI } from './searchEngine.js';
import { Notification } from './notification.js';
import { IconManager } from './iconManager.js';

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
          value: I18n.getCurrentLanguage(),
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
          value: 'auto',
          description: I18n.getMessage('settingsThemeDesc', '选择应用的主题外观')
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
    
    switch (item.type) {
      case 'checkbox':
        const checkbox = Utils.createElement('input', 'setting-checkbox', {
          type: 'checkbox',
          id: item.id,
          checked: item.value
        });
        const checkboxLabel = Utils.createElement('label', 'checkbox-switch', { for: item.id });
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
          value: item.value
        });
        const rangeValue = Utils.createElement('span', 'range-value', {}, `${item.value}${item.unit || ''}`);
        rangeContainer.append(range, rangeValue);
        itemControl.appendChild(rangeContainer);
        
        // 更新显示值
        range.addEventListener('input', (e) => {
          rangeValue.textContent = `${e.target.value}${item.unit || ''}`;
        });
        break;
        
      case 'select':
        const select = Utils.createElement('select', 'setting-select', { id: item.id });
        item.options.forEach(option => {
          const optionElement = Utils.createElement('option', '', { value: option.value }, option.label);
          if (option.value === item.value) {
            optionElement.selected = true;
          }
          select.appendChild(optionElement);
        });
        
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
        }
        
        itemControl.appendChild(select);
        break;
        
      case 'radio':
        const radioGroup = Utils.createElement('div', 'radio-group');
        item.options.forEach(option => {
          const radioContainer = Utils.createElement('div', 'radio-item');
          const radio = Utils.createElement('input', 'setting-radio', {
            type: 'radio',
            id: `${item.id}-${option.value}`,
            name: item.id,
            value: option.value,
            checked: option.value === item.value
          });
          const radioLabel = Utils.createElement('label', '', { for: `${item.id}-${option.value}` }, option.label);
          radioContainer.append(radio, radioLabel);
          radioGroup.appendChild(radioContainer);
        });
        itemControl.appendChild(radioGroup);
        break;

      case 'custom':
        if (item.id === 'search-engine-list') {
          const searchEngineList = await Settings.createSearchEngineList();
          itemControl.appendChild(searchEngineList);
        }
        break;
        
      case 'button':
        const button = Utils.createElement('button', `btn ${item.buttonClass || 'btn-primary'}`, {
          id: item.id,
          type: 'button'
        }, item.buttonText || item.label);
        
        // 为添加搜索引擎按钮添加处理逻辑
        if (item.id === 'add-search-engine') {
          button.addEventListener('click', () => {
            Settings.showAddSearchEngineModal();
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

  bindEvents: (modalId) => {
    const modal = document.getElementById(modalId);
    
    // 关闭按钮
    modal.querySelector('.modal-close').addEventListener('click', () => {
      Menu.Modal.hide(modalId);
    });
    
    // 点击模态框外部关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        Menu.Modal.hide(modalId);
      }
    });
    
    // 分类切换
    modal.querySelectorAll('.settings-category').forEach(categoryElement => {
      categoryElement.addEventListener('click', () => {
        // 移除所有活动状态
        modal.querySelectorAll('.settings-category').forEach(el => el.classList.remove('active'));
        // 添加当前活动状态
        categoryElement.classList.add('active');
        
        // 更新当前分类
        Settings.currentCategory = categoryElement.dataset.category;
        
        // 渲染内容
        Settings.renderCategoryContent(Settings.currentCategory);
      });
    });
    
    // 添加拖动功能
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      Menu._makeModalDraggable(modal, modalContent);
    }
  }
};