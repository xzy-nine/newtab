/**
 * 菜单系统模块
 * 包含上下文菜单、模态框、表单模态框等功能
 */

import { I18n } from './i18n.js';
import { Utils } from './utils.js';

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
      `<span class="modal-close">&times;</span><h2>${title}</h2>`);
    
    const formContainer = Utils.createElement('div', 'modal-form');
    
    formItems.forEach(item => {
      const formGroup = Utils.createElement('div', 'form-group');
      
      const label = Utils.createElement('label', '', { for: item.id }, item.label);
      
      let input;
      if (item.type === 'textarea') {
        input = Utils.createElement('textarea', '', { id: item.id });
      } else {
        input = Utils.createElement('input', '', { 
          id: item.id, 
          type: item.type || 'text' 
        });
      }
      
      if (item.placeholder) input.placeholder = item.placeholder;
      if (item.required) input.required = true;
      if (item.value) input.value = item.value;
      
      formGroup.append(label, input);
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
          formData[item.id] = input.value.trim();
          if (item.required && !formData[item.id]) {
            input.classList.add('error');
            allFilled = false;
          }
        }
      });
      
      if (!allFilled) {
        let errorMessage = document.getElementById(`${modalId}-error`);
        if (!errorMessage) {
          errorMessage = Utils.createElement(
            'div', 
            'form-error', 
            { id: `${modalId}-error` }, 
            I18n.getMessage('pleaseCompleteAllFields') || '请填写所有必填项'
          );
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
          button.addEventListener('click', () => {
            modal.style.display = 'none';
          });
        });
        
        modal.addEventListener('click', e => {
          if (e.target === modal) modal.style.display = 'none';
        });
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
        modal.querySelectorAll('.modal-close').forEach(button => {
          const newButton = button.cloneNode(true);
          button.parentNode.replaceChild(newButton, button);
          
          newButton.addEventListener('click', () => {
            Menu.Modal.hide(modalId);
          });
        });
        
        modal.addEventListener('click', e => {
          if (e.target === modal) Menu.Modal.hide(modalId);
        });
        
        modal.dataset.initialized = 'true';
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

      // 创建或获取模态框
      let modal = document.getElementById(modalId);
      if (!modal) {
        modal = Utils.createElement('div', 'modal', {id: modalId});
        const modalContent = Utils.createElement('div', 'modal-content');
        
        // 为不同模式设置不同的模态框样式
        if (mode === 'background') {
          modalContent.classList.add('modal-content-wide');
        } else if (mode === 'icon') {
          modalContent.classList.add('modal-content-compact');
        }
        
        // 构建模态框HTML
        let modalHtml = `
          <span class="modal-close">&times;</span>
          <h2>${title}</h2>
          <div class="modal-form">
        `;
        
        // URL输入框（如果允许）
        if (allowUrl) {
          modalHtml += `
            <div class="form-group">
              <label for="${modalId}-url">${urlLabel}</label>
              <input type="url" id="${modalId}-url" placeholder="${urlPlaceholder}">
            </div>
          `;
        }
        
        // 文件上传（如果允许）
        if (allowUpload) {
          modalHtml += `
            <div class="form-group">
              <label for="${modalId}-upload">${uploadLabel}</label>
              <input type="file" id="${modalId}-upload" accept="image/*">
            </div>
          `;
        }
        
        // 根据模式调整预览区样式
        const previewClass = mode === 'background' ? 'image-preview-bg' : 'image-preview-icon';
        modalHtml += `<div class="image-preview ${previewClass}" id="${modalId}-preview"></div>`;
        
        // 按钮组
        modalHtml += `<div class="form-actions">`;
        
        // 添加重置按钮（如果需要）
        if (showReset && typeof onReset === 'function') {
          modalHtml += `<button id="${modalId}-reset" class="btn btn-danger">${resetText}</button>`;
        }
        
        modalHtml += `
            <button id="${modalId}-cancel" class="btn">${cancelText}</button>
            <button id="${modalId}-confirm" class="btn btn-primary">${confirmText}</button>
          </div>
        </div>`;
        
        modalContent.innerHTML = modalHtml;
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
      }
      
      // 显示模态框
      Menu.Modal.show(modalId);
      
      // 清空旧数据
      if (allowUrl) {
        const urlInput = document.getElementById(`${modalId}-url`);
        if (urlInput) urlInput.value = '';
      }
      
      const preview = document.getElementById(`${modalId}-preview`);
      if (preview) preview.innerHTML = '';
      
      
      // 添加文件上传和预览功能
      if (allowUpload) {
        const uploadInput = document.getElementById(`${modalId}-upload`);
        if (uploadInput) {
          // 移除旧事件并重置
          const newUploadInput = uploadInput.cloneNode(true);
          uploadInput.parentNode.replaceChild(newUploadInput, uploadInput);
          newUploadInput.value = '';
          
          // 添加预览功能
          newUploadInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
              const preview = document.getElementById(`${modalId}-preview`);
              if (preview) {
                // 先显示加载状态
                preview.innerHTML = `<div class="loading-spinner"></div>`;
                
                // 压缩图像
                const compressedImage = await Utils.fileToBase64(file);
                
                // 为不同模式设置不同的预览样式
                if (mode === 'background') {
                  preview.innerHTML = `
                    <div class="browser-frame"></div>
                    <img src="${compressedImage}" alt="Background Preview" class="preview-bg-img">
                  `;
                } else { // 图标或默认模式
                  preview.innerHTML = `<img src="${compressedImage}" alt="Icon Preview" class="preview-icon-img">`;
                }
              }
            } catch (error) {
              console.error('Failed to process image:', error);
              Notification.notify({
                title: I18n.getMessage('error') || '错误',
                message: error.message || I18n.getMessage('imageProcessingError') || '图片处理失败',
                type: 'error',
                duration: 5000
              });
            }
          });
        }
      }
      
      // URL输入预览功能
      if (allowUrl) {
        const urlInput = document.getElementById(`${modalId}-url`);
        if (urlInput) {
          urlInput.addEventListener('input', Utils.debounce(async function() {
            const url = this.value.trim();
            if (!url) return;
            
            const preview = document.getElementById(`${modalId}-preview`);
            if (!preview) return;
            
            // 尝试加载URL作为图像
            preview.innerHTML = `<div class="loading-spinner"></div>`;
            
            const img = new Image();
            img.onload = function() {
              if (mode === 'background') {
                preview.innerHTML = `
                  <div class="browser-frame"></div>
                  <img src="${url}" alt="Background Preview" class="preview-bg-img">
                `;
              } else { // 图标或默认模式
                preview.innerHTML = `<img src="${url}" alt="Icon Preview" class="preview-icon-img">`;
              }
            };
            
            img.onerror = function() {
              preview.innerHTML = `<div class="error-message">${I18n.getMessage('imageLoadError') || '图片加载失败'}</div>`;
            };
            
            img.src = url;
          }, 500));
        }
      }
      
      // 绑定确认按钮事件
      const confirmBtn = document.getElementById(`${modalId}-confirm`);
      if (confirmBtn) {
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', async () => {
          // 获取选择的图像数据
          let imageData = null;
          
          // 优先使用上传的图片
          const uploadInput = document.getElementById(`${modalId}-upload`);
          const file = uploadInput && uploadInput.files[0];
          
          if (file) {
            try {
              // 压缩并转换图像
              imageData = await Utils.fileToBase64(file);
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
      }
      
      // 绑定取消按钮事件
      const cancelBtn = document.getElementById(`${modalId}-cancel`);
      if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', () => {
          Menu.Modal.hide(modalId);
          onCancel();
        });
      }
      
      // 绑定重置按钮事件（如果存在）
      if (showReset && typeof onReset === 'function') {
        const resetBtn = document.getElementById(`${modalId}-reset`);
        if (resetBtn) {
          const newResetBtn = resetBtn.cloneNode(true);
          resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
          newResetBtn.addEventListener('click', () => {
            Menu.Modal.hide(modalId);
            onReset();
          });
        }
      }
      
      return modal;
    }
  },
};