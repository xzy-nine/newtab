/**
 * 菜单系统模块
 * 包含上下文菜单、模态框、表单模态框等功能
 */
import { Utils } from './utils.js';
import { I18n } from './i18n.js';

/**
 * 菜单系统命名空间
 */
export const Menu = {
  /**
   * 显示表单模态框
   * @param {string} title 模态框标题
   * @param {Array} formItems 表单项配置数组
   * @param {Function} onConfirm 确认回调函数
   * @param {string} confirmText 确认按钮文本
   * @param {string} cancelText 取消按钮文本
   * @returns {Object} 模态框控制对象: {close}
   */
  showFormModal: (title, formItems, onConfirm, confirmText, cancelText) => {
    const modalId = 'form-modal-' + Date.now();
    const modal = Utils.createElement('div', 'modal', { id: modalId });
    
    const modalContent = Utils.createElement('div', 'modal-content', {}, 
      `<span class="modal-close">&times;</span><h2 class="modal-header">${title}</h2>`);
    
    const formContainer = Utils.createElement('div', 'modal-form');
    
    formItems.forEach(item => {
      // 判断是否为checkbox
      const groupClass = item.type === 'checkbox' ? 'form-group checkbox-group' : 'form-group';
      const formGroup = Utils.createElement('div', groupClass);

      const label = Utils.createElement('label', '', { for: item.id }, item.label);

      let input;
      if (item.type === 'textarea') {
        input = Utils.createElement('textarea', '', { id: item.id });
      } else if (item.type === 'checkbox') {
        input = Utils.createElement('input', '', {
          id: item.id,
          type: 'checkbox'
        });
      } else {
        input = Utils.createElement('input', '', {
          id: item.id,
          type: item.type || 'text'
        });
      }

      if (item.placeholder) input.placeholder = item.placeholder;
      if (item.required) input.required = true;
      if (item.value !== undefined) {
        if (item.type === 'checkbox') {
          input.checked = !!item.value;
        } else {
          input.value = item.value;
        }
      }

      // 复选框放在label前面
      if (item.type === 'checkbox') {
        formGroup.append(input, label);
      } else {
        formGroup.append(label, input);
      }
      formContainer.appendChild(formGroup);
    });
    
    const actionDiv = Utils.createElement('div', 'form-actions');

    const cancelButton = Utils.createElement(
      'button', 
      'btn', 
      { id: `${modalId}-cancel` },
      cancelText || I18n.getMessage('cancel') || '取消'
    );

    const confirmButton = Utils.createElement(
      'button', 
      'btn btn-primary', 
      { id: `${modalId}-confirm` },
      confirmText || I18n.getMessage('confirm') || '确认'
    );
    
    actionDiv.append(cancelButton, confirmButton);
    formContainer.appendChild(actionDiv);
    modalContent.appendChild(formContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    modal.style.display = 'block';
    
    // 添加拖动功能
    Menu._makeModalDraggable(modal, modalContent);
    
    // 将模态框居中显示
    Menu._centerModal(modal, modalContent);
    
    const close = () => {
      modal.style.display = 'none';
      setTimeout(() => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
      }, 300);
    };
    
    confirmButton.addEventListener('click', () => {
      const formData = {};
      let allFilled = true;
      
      formItems.forEach(item => {
        const input = document.getElementById(item.id);
        if (input) {
          // 针对复选框特殊处理
          if (item.type === 'checkbox') {
            formData[item.id] = input.checked;  // 使用checked属性而不是value
          } else {
            formData[item.id] = input.value.trim();
          }
          if (item.required && !formData[item.id]) {
            allFilled = false;
            input.classList.add('error');
          }
        }
      });
      
      if (!allFilled) {
        let errorMessage = document.getElementById(`${modalId}-error`);
        if (!errorMessage) {
          errorMessage = Utils.createElement('div', 'form-error', { id: `${modalId}-error` }, 
            I18n.getMessage('fillRequiredFields') || '请填写所有必填字段');
          formContainer.insertBefore(errorMessage, actionDiv);
        }
        return;
      }
      
      onConfirm(formData);
      close();
    });
    
    cancelButton.addEventListener('click', close);
    
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    
    return { close };
  },

  /**
   * 模态框功能
   */
  Modal: {
    initEvents: () => {
      document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelectorAll('.modal-close').forEach(button => {
          Utils.replaceEventHandler('.modal-close', 'click', () => {
            modal.classList.remove('visible');
          });
        });
        
        modal.addEventListener('click', e => {
          if (e.target === modal) {
            modal.classList.remove('visible');
          }
        });
        
        // 为已有的模态框添加拖动功能
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          Menu._makeModalDraggable(modal, modalContent);
        }
      });
    },

    show: modalId => {
      const modal = document.getElementById(modalId);
      if (!modal) {
        console.error(`Modal with id ${modalId} not found`);
        return;
      }
      
      modal.classList.add('visible');
      
      if (!modal.dataset.initialized) {
        Utils.replaceEventHandler(`#${modalId} .modal-close`, 'click', () => {
          modal.classList.remove('visible');
        });
        
        modal.addEventListener('click', e => {
          if (e.target === modal) {
            modal.classList.remove('visible');
          }
        });
        
        // 添加拖动功能
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          Menu._makeModalDraggable(modal, modalContent);
          
          // 初始化时居中显示
          Menu._centerModal(modal, modalContent);
        }
        
        modal.dataset.initialized = 'true';
      } else {
        // 已初始化的模态框再次显示时居中
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          Menu._centerModal(modal, modalContent);
        }
      }
    },

    hide: modalId => {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('visible');
    }
  },

  /**
   * 上下文菜单功能
   */
  ContextMenu: {
    /**
     * 初始化上下文菜单功能
     */
    init: function() {
      // 通用关闭菜单事件
      document.addEventListener('click', () => {
        document.querySelectorAll('.context-menu.visible').forEach(menu => {
          menu.classList.remove('visible');
        });
      });

      // ESC键关闭菜单
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          document.querySelectorAll('.context-menu.visible').forEach(menu => {
            menu.classList.remove('visible');
          });
        }
      });
    },

    /**
     * 显示自定义上下文菜单
     * @param {Event} event - 触发事件
     * @param {Array} items - 菜单项数组，每项包含 {id, text, callback, disabled, divider} 属性
     * @param {Object} options - 配置选项
     * @returns {HTMLElement} 菜单元素
     */
    show: function(event, items = [], options = {}) {
      const menuId = options.menuId || 'general-context-menu';
      
      if (options.preventDefaultAndStopPropagation !== false) {
        event.preventDefault();
        event.stopPropagation();
      }
      
      // 创建或获取上下文菜单
      let contextMenu = document.getElementById(menuId);
      if (!contextMenu) {
        contextMenu = Utils.createElement('div', 'context-menu', {id: menuId});
        document.body.appendChild(contextMenu);
      }
      
      // 清空旧内容
      contextMenu.innerHTML = '';
      
      // 创建菜单项
      items.forEach(item => {
        if (item.divider) {
          contextMenu.appendChild(Utils.createElement('div', 'context-menu-divider'));
          return;
        }
        
        const menuItem = Utils.createElement(
          'div', 
          `context-menu-item${item.disabled ? ' disabled' : ''}${item.class ? ' ' + item.class : ''}`, 
          {id: item.id || ''},
          item.text || ''
        );
        
        if (!item.disabled && typeof item.callback === 'function') {
          menuItem.addEventListener('click', () => {
            item.callback();
            contextMenu.classList.remove('visible');
          });
        }
        
        contextMenu.appendChild(menuItem);
      });
      
      // 设置菜单位置
      contextMenu.style.left = `${event.pageX}px`;
      contextMenu.style.top = `${event.pageY}px`;
      contextMenu.classList.add('visible');
      
      return contextMenu;
    },

    /**
     * 隐藏所有上下文菜单
     */
    hideAll: function() {
      document.querySelectorAll('.context-menu').forEach(menu => {
        menu.classList.remove('visible');
      });
    }
  },

  /**
   * 图像选择器
   */
  ImageSelector: {
    /**
     * 显示图像选择模态框
     * @param {Object} options - 配置选项
     * @returns {HTMLElement} 模态框元素
     */
    show: function(options = {}) {
      const {
        title = I18n.getMessage('selectImage') || '选择图片',
        modalId = 'image-selector-modal',
        onConfirm = () => {},
        onReset = null,
        onCancel = () => {},
        allowUrl = true,
        allowUpload = true,
        showReset = false,
        mode = 'icon', // 默认为图标模式
        confirmText = I18n.getMessage('confirm') || '确认',
        cancelText = I18n.getMessage('cancel') || '取消',
        resetText = I18n.getMessage('resetIcon') || '重置',
        urlPlaceholder = 'https://example.com/image.png',
        maxWidth = mode === 'icon' ? 256 : 1920,
        maxHeight = mode === 'icon' ? 256 : 1080,
        quality = 1,
        urlLabel = I18n.getMessage('imageUrl') || '图片URL',
        uploadLabel = I18n.getMessage('uploadImage') || '上传图片'
      } = options;

      // 删除旧的模态框（如果存在）以避免事件绑定问题
      const oldModal = document.getElementById(modalId);
      if (oldModal) {
        oldModal.remove();
      }

      // 创建新的模态框
      const modal = Utils.createElement('div', 'modal', {id: modalId});
      
      const modalContentClass = mode === 'background' ? 
        'modal-content modal-content-wide' : 
        'modal-content';
      
      const modalContent = Utils.createElement('div', modalContentClass);
      
      // 构建模态框内容
      const modalClose = Utils.createElement('span', 'modal-close', {}, '&times;');
      const modalTitle = Utils.createElement('h2', '', {}, title);
      const modalForm = Utils.createElement('div', 'modal-form');
      
      // 添加到模态框
      modalContent.appendChild(modalClose);
      modalContent.appendChild(modalTitle);
      
      // URL输入框（如果允许）
      if (allowUrl) {
        const formGroup = Utils.createElement('div', 'form-group');
        const label = Utils.createElement('label', '', { for: `${modalId}-url` }, urlLabel);
        const input = Utils.createElement('input', '', { 
          id: `${modalId}-url`, 
          type: 'url', 
          placeholder: urlPlaceholder 
        });
        
        formGroup.append(label, input);
        modalForm.appendChild(formGroup);
      }
      
      // 文件上传（如果允许）
      if (allowUpload) {
        const formGroup = Utils.createElement('div', 'form-group');
        const label = Utils.createElement('label', '', { for: `${modalId}-upload` }, uploadLabel);
        const input = Utils.createElement('input', '', { 
          id: `${modalId}-upload`, 
          type: 'file',
          accept: 'image/*' 
        });
        
        formGroup.append(label, input);
        modalForm.appendChild(formGroup);
      }
      
      // 预览区
      const previewClass = `image-preview ${mode === 'background' ? 'image-preview-bg' : 'image-preview-icon'}`;
      const preview = Utils.createElement('div', previewClass, { id: `${modalId}-preview` });
      modalForm.appendChild(preview);
      
      // 按钮组
      const formActions = Utils.createElement('div', 'form-actions');
      
      // 添加重置按钮（如果需要）
      if (showReset && typeof onReset === 'function') {
        const resetBtn = Utils.createElement('button', 'btn btn-danger', { id: `${modalId}-reset` }, resetText);
        formActions.appendChild(resetBtn);
      }
      
      const cancelBtn = Utils.createElement('button', 'btn', { id: `${modalId}-cancel` }, cancelText);
      const confirmBtn = Utils.createElement('button', 'btn btn-primary', { id: `${modalId}-confirm` }, confirmText);
      
      formActions.append(cancelBtn, confirmBtn);
      modalForm.appendChild(formActions);
      
      modalContent.appendChild(modalForm);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);
      
      // 直接绑定事件（而不是使用独立的方法）
      
      // 处理关闭按钮
      modalClose.addEventListener('click', () => {
        Menu.Modal.hide(modalId);
        onCancel();
      });
      
      // 处理文件上传事件
      if (allowUpload) {
        const uploadInput = document.getElementById(`${modalId}-upload`);
        uploadInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function(event) {
            const imageData = event.target.result;
            console.log('Image loaded, size:', imageData.length);
            
            const preview = document.getElementById(`${modalId}-preview`);
            if (preview) {
              if (mode === 'background') {
              // 背景图片预览 - 使用当前网页比例
              const currentAspectRatio = window.innerWidth / window.innerHeight;
              preview.innerHTML = `<img src="${imageData}" alt="" style="width: 100%; object-fit: cover; aspect-ratio: ${currentAspectRatio};">`;
              } else {
              // 图标预览 - 保持方形比例
              preview.innerHTML = `<img src="${imageData}" alt="" style="width: 64px; height: 64px; object-fit: contain;">`;
              }
            }
            };
            
          reader.onerror = function(error) {
            console.error('FileReader error:', error); // 调试日志
            const preview = document.getElementById(`${modalId}-preview`);
            if (preview) {
              preview.innerHTML = `<div class="error-message">${I18n.getMessage('imageLoadError') || '图片加载失败'}</div>`;
            }
          };
          
          reader.readAsDataURL(file);
        });
      }
      
      // URL输入预览功能
      if (allowUrl) {
        const urlInput = document.getElementById(`${modalId}-url`);
        urlInput.addEventListener('input', Utils.debounce(function() {
          const url = this.value.trim();
          if (!url) return;
          const preview = document.getElementById(`${modalId}-preview`);
          if (!preview) return;
          
          preview.innerHTML = `<div class="loading-spinner"></div>`;
          
          const img = new Image();
          img.onload = function() {
            if (mode === 'background') {
              // 背景图片预览 - 保持16:9比例并填满预览区域
              preview.innerHTML = `<img src="${url}" alt="" style="width: 100%; object-fit: cover; aspect-ratio: 16/9;">`;
            } else {
              // 图标预览 - 保持方形比例
              preview.innerHTML = `<img src="${url}" alt="" style="width: 64px; height: 64px; object-fit: contain;">`;
            }
          };
          
          img.onerror = function(error) {
            console.error('Image URL error:', error); // 调试日志
            preview.innerHTML = `<div class="error-message">${I18n.getMessage('imageLoadError') || '图片加载失败'}</div>`;
          };
          
          img.src = url;
        }, 500));
      }
      
      // 绑定确认按钮事件
      confirmBtn.addEventListener('click', async () => {
        let imageData = null;
        
        // 优先使用上传的图片
        const uploadInput = document.getElementById(`${modalId}-upload`);
        const file = uploadInput && uploadInput.files[0];
        
        if (file) {
          try {
            imageData = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          } catch (error) {
            console.error('Failed to process image:', error);
            Notification.notify({
              title: I18n.getMessage('error') || '错误',
              message: error.message || I18n.getMessage('imageProcessingError') || '图片处理失败',
              type: 'error',
              duration: 5000
            });
            return;
          }
        } else if (allowUrl) {
          // 其次使用URL
          const urlInput = document.getElementById(`${modalId}-url`);
          const url = urlInput && urlInput.value.trim();
          if (url) {
            imageData = url;
          }
        }
        
        Menu.Modal.hide(modalId);
        onConfirm(imageData);
      });
      
      // 绑定取消按钮事件
      cancelBtn.addEventListener('click', () => {
        Menu.Modal.hide(modalId);
        onCancel();
      });
      
      // 绑定重置按钮事件（如果存在）
      if (showReset && typeof onReset === 'function') {
        const resetBtn = document.getElementById(`${modalId}-reset`);
        resetBtn.addEventListener('click', () => {
          Menu.Modal.hide(modalId);
          onReset();
        });
      }
      
      // 显示模态框
      Menu.Modal.show(modalId);
      
      // 如果存在onShow回调，执行它
      if (typeof options.onShow === 'function') {
        setTimeout(() => {
          options.onShow();
        }, 100);
      }
      
      return modal;
    }
  },

  /**
   * 使模态框可拖动
   * @param {HTMLElement} modal - 模态框元素
   * @param {HTMLElement} modalContent - 模态框内容元素
   */
  _makeModalDraggable: function(modal, modalContent) {
    let isDragging = false;
    let offsetX, offsetY;
    
    // 查找模态框标题元素作为拖动区域
    const dragHandle = modalContent.querySelector('.modal-header, h2');
    
    if (!dragHandle) return;
    
    // 添加指示可拖动的样式
    dragHandle.classList.add('draggable');
    
    // 开始拖动
    dragHandle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 只响应左键点击
      
      isDragging = true;
      
      // 计算鼠标在模态框内容中的位置偏移
      const rect = modalContent.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      
      // 防止文本选择
      e.preventDefault();
      
      // 添加拖动中样式
      modalContent.classList.add('dragging');
    });
    
    // 拖动过程
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      // 计算新位置
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      
      // 更新模态框位置
      modalContent.style.left = `${x}px`;
      modalContent.style.top = `${y}px`;
      
      // 确保模态框不会被拖出屏幕
      Menu._keepModalInViewport(modalContent);
    });
    
    // 结束拖动
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        modalContent.classList.remove('dragging');
      }
    });
    
    // 防止拖动过程中触发内部点击事件
    modalContent.addEventListener('click', (e) => {
      if (isDragging) {
        e.stopPropagation();
      }
    });
  },
  
  /**
   * 使模态框保持在视窗内
   * @param {HTMLElement} modalContent - 模态框内容元素
   */
  _keepModalInViewport: function(modalContent) {
    const rect = modalContent.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 检查并调整水平位置
    if (rect.left < 0) {
      modalContent.style.left = '0px';
    } else if (rect.right > viewportWidth) {
      modalContent.style.left = `${viewportWidth - rect.width}px`;
    }
    
    // 检查并调整垂直位置
    if (rect.top < 0) {
      modalContent.style.top = '0px';
    } else if (rect.bottom > viewportHeight) {
      modalContent.style.top = `${viewportHeight - rect.height}px`;
    }
  },
  
  /**
   * 使模态框居中显示
   * @param {HTMLElement} modal - 模态框元素
   * @param {HTMLElement} modalContent - 模态框内容元素
   */
  _centerModal: function(modal, modalContent) {
    // 重置任何之前设置的位置
    modalContent.style.position = 'relative';
    modalContent.style.left = 'auto';
    modalContent.style.top = 'auto';
    modalContent.style.transform = 'none';
    
    // 必须在下一个宏任务中执行，确保元素已经渲染
    setTimeout(() => {
      // 获取模态框大小
      const rect = modalContent.getBoundingClientRect();
      
      // 计算居中位置
      const x = (window.innerWidth - rect.width) / 2;
      const y = (window.innerHeight - rect.height) / 2;
      
      // 更新位置并使用绝对定位
      modalContent.style.position = 'absolute';
      modalContent.style.left = `${x}px`;
      modalContent.style.top = `${y}px`;
      modalContent.style.margin = '0';
    }, 0);
  }
};