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
      id: 'grid-system',
      icon: '📐',
      title: I18n.getMessage('settingsGridSystem', '网格系统'),
      items: [
        {
          id: 'grid-enabled',
          label: I18n.getMessage('settingsGridEnabled', '启用网格系统'),
          type: 'checkbox',
          value: GridSystem.gridEnabled,
          description: I18n.getMessage('settingsGridEnabledDesc', '启用后元素将自动吸附到网格位置')
        },
        {
          id: 'grid-debug',
          label: I18n.getMessage('settingsGridDebug', '显示网格线'),
          type: 'checkbox',
          value: GridSystem.isDebugMode,
          description: I18n.getMessage('settingsGridDebugDesc', '显示网格辅助线，帮助对齐元素')
        },
        {
          id: 'grid-snap-threshold',
          label: I18n.getMessage('settingsGridSnapThreshold', '吸附阈值'),
          type: 'range',
          min: 5,
          max: 30,
          step: 1,
          value: GridSystem.snapThreshold,
          unit: 'px',
          description: I18n.getMessage('settingsGridSnapThresholdDesc', '元素吸附到网格的距离阈值')        }
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
          value: AI.getConfig().enabled,
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
          value: AI.getConfig().systemPrompt,
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
        
        // 为网格系统设置添加事件监听
        if (item.id === 'grid-enabled') {
          checkbox.addEventListener('change', (e) => {
            Settings.handleGridEnabledChange(e.target.checked);
          });
        } else if (item.id === 'grid-debug') {
          checkbox.addEventListener('change', (e) => {
            Settings.handleGridDebugChange(e.target.checked);
          });
        } else if (item.id === 'ai-enabled') {
          checkbox.addEventListener('change', (e) => {
            Settings.handleAIEnabledChange(e.target.checked);
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
          value: item.value
        });
        const rangeValue = Utils.createElement('span', 'range-value', {}, `${item.value}${item.unit || ''}`);
        rangeContainer.append(range, rangeValue);
        itemControl.appendChild(rangeContainer);
          // 更新显示值
        range.addEventListener('input', (e) => {
          rangeValue.textContent = `${e.target.value}${item.unit || ''}`;
          
          // 为网格吸附阈值添加实时更新
          if (item.id === 'grid-snap-threshold') {
            Settings.handleGridSnapThresholdChange(parseInt(e.target.value));
          }
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
        
      case 'text':
        const textInput = Utils.createElement('input', 'setting-input', {
          type: 'text',
          id: item.id,
          value: item.value || '',
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
          value: item.value || '',
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
        textarea.value = item.value || '';
        
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
        const providerItem = Utils.createElement('div', 'ai-provider-item-setting');
        
        // 供应商图标
        const providerIcon = Utils.createElement('div', 'provider-icon', {}, '🤖');
        
        // 供应商名称
        const providerName = Utils.createElement('div', 'provider-name', {}, provider.name);
        
        // 供应商API URL
        const providerUrl = Utils.createElement('div', 'provider-url', {}, provider.apiUrl);
        
        // 模型信息
        const providerModel = Utils.createElement('div', 'provider-model', {}, 
          `${I18n.getMessage('model', '模型')}: ${provider.model}`);
        
        // 当前供应商标识
        const isCurrentProvider = currentProvider && currentProvider.name === provider.name;
        if (isCurrentProvider) {
          providerItem.classList.add('current-provider');
          const currentBadge = Utils.createElement('span', 'current-badge', {}, 
            I18n.getMessage('currentProvider', '当前'));
          providerItem.appendChild(currentBadge);
        }
        
        // 供应商信息容器
        const providerInfo = Utils.createElement('div', 'provider-info');
        providerInfo.append(providerName, providerUrl, providerModel);
        
        // 操作按钮
        const providerActions = Utils.createElement('div', 'provider-actions');
        
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
        
        // 删除按钮（不能删除默认供应商)
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
                    const success = await AI.updateConfig({ 
                      providers: newProviders,
                      currentProvider: newProviders[0]
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
      const errorMsg = Utils.createElement('div', 'error-message', {}, 
        I18n.getMessage('loadProviderListError', '加载AI供应商列表失败'));
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
   */
  showAddAIProviderModal: () => {
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
        type: 'text',
        id: 'custom-provider-api-key',
        label: I18n.getMessage('providerApiKey', 'API密钥'),
        placeholder: 'sk-...',
        required: true
      },
      {
        type: 'text',
        id: 'custom-provider-model',
        label: I18n.getMessage('providerModel', '模型名称'),
        placeholder: 'gpt-3.5-turbo',
        required: true
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
        
        const aiConfig = AI.getConfig();
        const providers = aiConfig.providers || [];
        const newProvider = { name, apiUrl, apiKey, model };
        
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
   */
  showEditAIProviderModal: (provider, index) => {
    const formItems = [
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
        required: true
      },
      {
        type: 'text',
        id: 'edit-provider-api-key',
        label: I18n.getMessage('providerApiKey', 'API密钥'),
        value: provider.apiKey || '',
        required: true
      },
      {
        type: 'text',
        id: 'edit-provider-model',
        label: I18n.getMessage('providerModel', '模型名称'),
        value: provider.model,
        required: true
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
        
        const aiConfig = AI.getConfig();
        const providers = [...aiConfig.providers];
        providers[index] = { ...provider, name, apiUrl, apiKey, model };
        
        const success = await AI.updateConfig({ providers });
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
  },
  /**
   * 处理网格系统启用/禁用
   * @param {boolean} enabled - 是否启用网格系统
   */
  handleGridEnabledChange(enabled) {
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
  },

  /**
   * 处理网格调试模式切换
   * @param {boolean} enabled - 是否启用调试模式
   */
  handleGridDebugChange(enabled) {
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
  },

  /**
   * 处理网格吸附阈值变化
   * @param {number} threshold - 新的吸附阈值
   */
  handleGridSnapThresholdChange(threshold) {
    GridSystem.setSnapThreshold(threshold);
  },

  /**
   * 处理AI启用/禁用
   * @param {boolean} enabled - 是否启用AI
   */
  handleAIEnabledChange(enabled) {
    AI.updateConfig({ enabled });
    
    // 显示通知
    Notification.notify({
      title: enabled 
        ? I18n.getMessage('aiEnabled', 'AI助手已启用')
        : I18n.getMessage('aiDisabled', 'AI助手已禁用'),
      message: enabled
        ? I18n.getMessage('aiEnabledMessage', 'AI按钮将显示在搜索框旁')
        : I18n.getMessage('aiDisabledMessage', 'AI按钮已隐藏'),
      type: enabled ? 'success' : 'info',
      duration: 2000
    });
  },

  /**
   * 处理AI设置变化
   * @param {string} settingId - 设置ID
   * @param {string} value - 设置值
   */
  handleAISettingChange(settingId, value) {
    const configKey = settingId.replace('ai-', '').replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
    AI.updateConfig({ [configKey]: value });
  },

  /**
   * 创建快速提示词编辑器
   * @returns {HTMLElement} - 编辑器容器
   */
  createQuickPromptsEditor() {
    const container = Utils.createElement('div', 'quick-prompts-editor');
    
    // 当前快速提示词列表
    const currentPrompts = AI.getConfig().quickPrompts || [];
    
    // 提示词列表容器
    const promptsList = Utils.createElement('div', 'prompts-list');
    
    // 渲染提示词列表
    const renderPrompts = () => {
      promptsList.innerHTML = '';
      currentPrompts.forEach((prompt, index) => {
        const promptItem = Utils.createElement('div', 'prompt-item');
        
        const promptText = Utils.createElement('input', 'prompt-input', {
          type: 'text',
          value: prompt,
          placeholder: I18n.getMessage('enterPrompt', '输入提示词...')
        });
        
        const deleteBtn = Utils.createElement('button', 'btn btn-small btn-danger', {}, '×');
        deleteBtn.addEventListener('click', () => {
          currentPrompts.splice(index, 1);
          AI.updateConfig({ quickPrompts: currentPrompts });
          renderPrompts();
        });
        
        promptText.addEventListener('change', () => {
          currentPrompts[index] = promptText.value.trim();
          AI.updateConfig({ quickPrompts: currentPrompts.filter(p => p) });
        });
        
        promptItem.append(promptText, deleteBtn);
        promptsList.appendChild(promptItem);
      });
    };
    
    // 添加按钮
    const addBtn = Utils.createElement('button', 'btn btn-small btn-primary', {}, 
      I18n.getMessage('addPrompt', '添加提示词'));
    addBtn.addEventListener('click', () => {
      currentPrompts.push('');
      AI.updateConfig({ quickPrompts: currentPrompts });
      renderPrompts();
      // 聚焦到新添加的输入框
      setTimeout(() => {
        const inputs = promptsList.querySelectorAll('.prompt-input');
        const lastInput = inputs[inputs.length - 1];
        if (lastInput) lastInput.focus();
      }, 100);
    });
    
    // 初始渲染
    renderPrompts();
    
    container.append(promptsList, addBtn);
    return container;
  }
};