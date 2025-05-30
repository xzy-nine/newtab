import { Menu } from './menu.js';
import { Utils } from './utils.js';
import { I18n } from './i18n.js';
import { SearchEngineAPI } from './searchEngine.js';
import { Notification } from './notification.js';
import { IconManager } from './iconManager.js'; // 添加 IconManager 导入

export const Settings = {
  // 设置配置
  categories: [
    {
      id: 'general',
      icon: '⚙️',
      title: '常规设置',
      items: [
        {
          id: 'language',
          label: '界面语言',
          type: 'select',
          options: [
            { value: 'zh-CN', label: '简体中文' },
            { value: 'en-US', label: 'English' },
            { value: 'ja-JP', label: '日本語' }
          ],
          value: 'zh-CN',
          description: '选择界面显示语言'
        },
        {
          id: 'theme',
          label: '主题模式',
          type: 'radio',
          options: [
            { value: 'auto', label: '跟随系统' },
            { value: 'light', label: '浅色模式' },
            { value: 'dark', label: '深色模式' }
          ],
          value: 'auto',
          description: '选择应用的主题外观'
        },
        {
          id: 'auto-save',
          label: '自动保存',
          type: 'checkbox',
          value: true,
          description: '自动保存设置更改'
        },
        {
          id: 'startup-delay',
          label: '启动延迟',
          type: 'range',
          min: 0,
          max: 5000,
          step: 100,
          value: 500,
          unit: 'ms',
          description: '应用启动时的延迟时间'
        }
      ]
    },
    {
      id: 'search-engines',
      icon: '🔍',
      title: '搜索引擎',
      items: [
        {
          id: 'search-engine-list',
          label: '搜索引擎管理',
          type: 'custom',
          description: '管理和配置搜索引擎'
        },
        {
          id: 'add-search-engine',
          label: '添加搜索引擎',
          type: 'button',
          buttonText: '添加自定义搜索引擎',
          buttonClass: 'btn-primary',
          description: '添加新的自定义搜索引擎'
        }
      ]
    },
    {
      id: 'appearance',
      icon: '🎨',
      title: '外观设置',
      items: [
        {
          id: 'background-blur',
          label: '背景模糊',
          type: 'checkbox',
          value: false,
          description: '启用背景模糊效果'
        },
        {
          id: 'opacity',
          label: '透明度',
          type: 'range',
          min: 0.1,
          max: 1,
          step: 0.05,
          value: 0.95,
          unit: '',
          description: '调整界面透明度'
        },
        {
          id: 'animation-speed',
          label: '动画速度',
          type: 'select',
          options: [
            { value: 'slow', label: '慢速' },
            { value: 'normal', label: '正常' },
            { value: 'fast', label: '快速' },
            { value: 'none', label: '禁用动画' }
          ],
          value: 'normal',
          description: '设置界面动画播放速度'
        },
        {
          id: 'font-size',
          label: '字体大小',
          type: 'range',
          min: 12,
          max: 24,
          step: 1,
          value: 16,
          unit: 'px',
          description: '调整界面字体大小'
        }
      ]
    },
    {
      id: 'privacy',
      icon: '🔒',
      title: '隐私安全',
      items: [
        {
          id: 'data-collection',
          label: '数据收集',
          type: 'checkbox',
          value: false,
          description: '允许收集匿名使用数据以改进产品'
        },
        {
          id: 'privacy-level',
          label: '隐私级别',
          type: 'radio',
          options: [
            { value: 'low', label: '低' },
            { value: 'medium', label: '中等' },
            { value: 'high', label: '高' }
          ],
          value: 'medium',
          description: '设置隐私保护级别'
        },
        {
          id: 'clear-search-data',
          label: '清除搜索数据',
          type: 'button',
          buttonText: '清除搜索引擎数据',
          buttonClass: 'btn-warning',
          description: '清除所有搜索引擎相关数据'
        },
        {
          id: 'clear-data',
          label: '清除数据',
          type: 'button',
          buttonText: '清除所有数据',
          buttonClass: 'btn-danger',
          description: '清除所有本地存储的数据'
        },
        {
          id: 'session-timeout',
          label: '会话超时',
          type: 'range',
          min: 5,
          max: 120,
          step: 5,
          value: 30,
          unit: '分钟',
          description: '设置会话超时时间'
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
    const title = Utils.createElement('h2', '', {}, '设置');
    modalHeader.append(title, closeBtn);
    
    // 设置主体
    const settingsBody = Utils.createElement('div', 'settings-body');
    
    // 左侧分类
    const sidebar = Utils.createElement('div', 'settings-sidebar');
    Settings.categories.forEach(category => {
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
    const category = Settings.categories.find(cat => cat.id === categoryId);
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
        
        // 为不同按钮添加特定的处理逻辑
        if (item.id === 'clear-data') {
          button.addEventListener('click', () => {
            if (confirm('确定要清除所有数据吗？此操作不可恢复。')) {
              localStorage.clear();
              sessionStorage.clear();
              alert('数据已清除');
            }
          });
        } else if (item.id === 'clear-search-data') {
          button.addEventListener('click', async () => {
            Notification.notify({
              title: '确认操作',
              message: '确定要清除所有搜索引擎数据吗？此操作不可恢复。',
              duration: 0,
              type: 'confirm',
              buttons: [
                {
                  text: '确认',
                  class: 'btn-primary confirm-yes',
                  callback: async () => {
                    const success = await SearchEngineAPI.clearStorage();
                    if (success) {
                      Notification.notify({
                        title: '成功',
                        message: '搜索引擎数据已清除，页面将刷新。',
                        type: 'success',
                        duration: 1500,
                        onClose: () => {
                          window.location.reload();
                        }
                      });
                    } else {
                      Notification.notify({
                        title: '错误',
                        message: '清除搜索引擎数据失败',
                        type: 'error',
                        duration: 3000
                      });
                    }
                  }
                },
                {
                  text: '取消',
                  class: 'confirm-no',
                  callback: () => {}
                }
              ]
            });
          });
        } else if (item.id === 'add-search-engine') {
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
          const currentBadge = Utils.createElement('span', 'current-badge', {}, '当前');
          engineItem.appendChild(currentBadge);
        }
        
        // 引擎信息容器
        const engineInfo = Utils.createElement('div', 'engine-info');
        engineInfo.append(engineName, engineUrl);
        
        // 操作按钮
        const engineActions = Utils.createElement('div', 'engine-actions');
        
        // 设为当前按钮
        if (!isCurrentEngine) {
          const setCurrentBtn = Utils.createElement('button', 'btn btn-small btn-primary', {}, '设为当前');
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
        const editBtn = Utils.createElement('button', 'btn btn-small btn-secondary', {}, '编辑');
        editBtn.addEventListener('click', () => {
          Settings.showEditSearchEngineModal(engine, index);
        });
        engineActions.appendChild(editBtn);
        
        // 删除按钮
        if (engines.length > 1) {
          const deleteBtn = Utils.createElement('button', 'btn btn-small btn-danger', {}, '删除');
          deleteBtn.addEventListener('click', () => {
            Notification.notify({
              title: '确认删除',
              message: `确定要删除搜索引擎 "${engine.name}" 吗？`,
              duration: 0,
              type: 'confirm',
              buttons: [
                {
                  text: '确认',
                  class: 'btn-primary confirm-yes',
                  callback: async () => {
                    const success = await SearchEngineAPI.deleteEngine(index);
                    if (success) {
                      Settings.refreshSearchEngineList();
                    }
                  }
                },
                {
                  text: '取消',
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
      const errorMsg = Utils.createElement('div', 'error-message', {}, '加载搜索引擎列表失败');
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
        label: '搜索引擎名称',
        required: true
      },
      {
        type: 'url',
        id: 'custom-engine-url',
        label: '搜索URL',
        placeholder: 'https://www.example.com/search?q=%s',
        required: true
      },
      {
        type: 'url',
        id: 'custom-engine-icon',
        label: '图标URL（可选）',
        required: false
      }
    ];

    Menu.showFormModal(
      '添加自定义搜索引擎',
      formItems,
      async (formData) => {
        const name = formData['custom-engine-name'];
        const url = formData['custom-engine-url'];
        const icon = formData['custom-engine-icon'];
        
        const success = await SearchEngineAPI.addCustomEngine({ name, url, icon });
        if (success) {
          Settings.refreshSearchEngineList();
          Notification.notify({
            title: '成功',
            message: '搜索引擎添加成功',
            type: 'success',
            duration: 2000
          });
        } else {
          Notification.notify({
            title: '错误',
            message: '添加搜索引擎失败',
            type: 'error',
            duration: 3000
          });
        }
      },
      '确认',
      '取消'
    );
  },

  showEditSearchEngineModal: (engine, index) => {
    const formItems = [
      {
        type: 'text',
        id: 'edit-engine-name',
        label: '搜索引擎名称',
        value: engine.name,
        required: true
      },
      {
        type: 'url',
        id: 'edit-engine-url',
        label: '搜索URL',
        value: engine.url,
        required: true
      },
      {
        type: 'url',
        id: 'edit-engine-icon',
        label: '图标URL（可选）',
        value: engine.icon || '',
        required: false
      }
    ];

    Menu.showFormModal(
      `编辑搜索引擎 - ${engine.name}`,
      formItems,
      async (formData) => {
        const name = formData['edit-engine-name'];
        const url = formData['edit-engine-url'];
        const icon = formData['edit-engine-icon'];
        
        const success = await SearchEngineAPI.editEngine(index, { name, url, icon });
        if (success) {
          Settings.refreshSearchEngineList();
          Notification.notify({
            title: '成功',
            message: '搜索引擎更新成功',
            type: 'success',
            duration: 2000
          });
        } else {
          Notification.notify({
            title: '错误',
            message: '更新搜索引擎失败',
            type: 'error',
            duration: 3000
          });
        }
      },
      '保存',
      '取消'
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

// 挂载事件
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('settings-btn');
  if (btn) {
    btn.addEventListener('click', Settings.open);
  }
});