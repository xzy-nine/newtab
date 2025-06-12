#!/usr/bin/env python3
"""
变更日志生成器
用于生成基于AI分析的版本变更日志

支持的运行模式:
1. workflow_call: 工作流调用模式
2. auto_release: 自动发布模式
3. manual_optimize: 手动优化模式
4. batch_all: 批量处理所有模式

依赖: requests, gitpython
"""

import os
import sys
import json
import re
import argparse
import logging
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import subprocess
import requests
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
import time


class RunMode(Enum):
    WORKFLOW_CALL = "workflow_call"
    AUTO_RELEASE = "auto_release"
    MANUAL_OPTIMIZE = "manual_optimize"
    BATCH_ALL = "batch_all"


@dataclass
class CommitInfo:
    hash: str
    message: str
    body: str = ""
    category: str = "OTHER"
    importance: int = 1


@dataclass
class AnalysisResult:
    categories: Dict[str, List[Dict[str, Any]]]
    summary: str
    highlights: List[str]


@dataclass
class BatchStats:
    """批量处理统计信息"""
    total_releases: int = 0
    processed_releases: int = 0
    success_count: int = 0
    ai_success_count: int = 0
    skipped_count: int = 0
    error_count: int = 0
    total_commits: int = 0
    start_time: float = 0
    
    def __post_init__(self):
        self.start_time = time.time()


class AIChangelogGenerator:
    """AI变更日志生成器主类"""
    
    def __init__(self, github_token: str, deepseek_api_key: str, repo: str):
        """
        初始化生成器
        
        Args:
            github_token: GitHub Personal Access Token
            deepseek_api_key: DeepSeek API密钥
            repo: GitHub仓库名 (格式: owner/repo)
        """
        self.github_token = github_token
        self.deepseek_api_key = deepseek_api_key
        self.repo = repo
        self.logger = self._setup_logger()
        
        # 批量处理统计
        self.batch_stats = BatchStats()
        
        # 加载外部配置文件
        self._load_configs()
        
        # GitHub API基础URL
        self.github_api_base = "https://api.github.com"
        self.deepseek_api_base = "https://api.deepseek.com/v1"
        
        # 请求头设置
        self.github_headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        self.deepseek_headers = {
            "Authorization": f"Bearer {deepseek_api_key}",
            "Content-Type": "application/json"
        }
    
    def _load_configs(self):
        """加载外部配置文件"""
        try:
            script_dir = Path(__file__).parent
            
            # 加载提示词配置
            with open(script_dir / 'prompts.json', 'r', encoding='utf-8') as f:
                self.prompts = json.load(f)
            
            # 加载API配置
            with open(script_dir / 'config.json', 'r', encoding='utf-8') as f:
                self.config = json.load(f)
            
            # 加载模板配置
            with open(script_dir / 'templates.json', 'r', encoding='utf-8') as f:
                self.templates = json.load(f)
            
            self.logger.info("✅ 配置文件加载成功")
            
        except Exception as e:
            self.logger.error(f"❌ 加载配置文件失败: {e}")
            raise Exception(f"配置文件加载失败，请确保所有配置文件存在且格式正确: {e}")
    
    def _setup_logger(self) -> logging.Logger:
        """设置日志记录器"""
        logger = logging.getLogger("ai_changelog")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            formatter = logging.Formatter(
                '%(asctime)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def validate_params(self, version: Optional[str] = None, release_id: Optional[str] = None, 
                       tag: Optional[str] = None, target: Optional[str] = None,
                       event_name: str = "workflow_dispatch") -> Tuple[RunMode, str, Optional[str]]:
        """
        验证输入参数并确定运行模式
        
        Args:
            version: 版本号 (自动触发时使用)
            release_id: Release ID (自动触发时使用)
            tag: 标签 (旧版手动触发兼容)
            target: 目标版本或标签 (新版手动触发使用)
            event_name: 事件名称
            
        Returns:
            Tuple[运行模式, 版本号, Release ID]
        """
        self.logger.info("🔍 验证输入参数...")
        
        if event_name == "workflow_call":
            # 自动触发模式：需要version和release_id
            if not version or not release_id:
                raise ValueError("工作流调用模式需要提供版本号和Release ID")
            mode = RunMode.WORKFLOW_CALL
            self.logger.info(f"🔗 工作流调用模式: 版本 {version}, Release ID {release_id}")
            return mode, version, release_id
            
        else:
            # 手动触发模式
            if target:
                # 新版手动触发：使用target参数
                if target.lower() == 'latest':
                    # 获取最新的release
                    self.logger.info("🎯 目标为latest，获取最新Release...")
                    latest_version, latest_release_id = self._get_latest_release()
                    mode = RunMode.MANUAL_OPTIMIZE
                    self.logger.info(f"📝 手动优化模式: 最新版本 {latest_version}")
                    return mode, latest_version, latest_release_id
                elif target.lower() == 'all':
                    # 批量处理所有release
                    self.logger.info("🔄 目标为all，批量处理所有Release...")
                    mode = RunMode.BATCH_ALL
                    self.logger.info("📦 批量处理模式: 处理所有Release")
                    return mode, "all", None
                else:
                    # 指定版本的手动触发
                    mode = RunMode.MANUAL_OPTIMIZE
                    self.logger.info(f"📝 手动优化模式: 指定版本 {target}")
                    return mode, target, None
                    
            elif tag:
                # 旧版手动触发兼容：使用tag参数
                if tag.lower() == 'all':
                    mode = RunMode.BATCH_ALL
                    self.logger.info("📦 批量处理模式(兼容): 处理所有Release")
                    return mode, "all", None
                else:
                    mode = RunMode.MANUAL_OPTIMIZE
                    self.logger.info(f"📝 手动优化模式(兼容): 标签 {tag}")
                    return mode, tag, None
                    
            elif release_id:
                # 旧版自动触发兼容：有release_id但没有version
                if not version:
                    raise ValueError("自动发布模式需要提供版本号")
                mode = RunMode.AUTO_RELEASE
                self.logger.info(f"🤖 自动发布模式(兼容): 版本 {version}, Release ID {release_id}")
                return mode, version, release_id
                
            else:
                raise ValueError("手动模式需要提供target参数，或使用兼容的tag参数")
    
    def _get_latest_release(self) -> Tuple[str, str]:
        """
        获取最新的Release信息
        
        Returns:
            Tuple[版本标签, Release ID]
        """
        self.logger.info("🔍 获取最新Release信息...")
        
        url = f"{self.github_api_base}/repos/{self.repo}/releases/latest"
        response = requests.get(url, headers=self.github_headers)
        
        if response.status_code != 200:
            error_msg = f"无法获取最新Release信息: {response.json().get('message', '未知错误')}"
            self.logger.error(f"❌ {error_msg}")
            raise Exception(error_msg)
        
        release_data = response.json()
        tag_name = release_data['tag_name']
        release_id = str(release_data['id'])
        
        self.logger.info(f"✅ 获取到最新Release: {tag_name} (ID: {release_id})")
        
        return tag_name, release_id

    def get_release_info(self, mode: RunMode, version: str, release_id: Optional[str] = None) -> Tuple[str, str]:
        """
        获取Release信息
        
        Args:
            mode: 运行模式
            version: 版本号
            release_id: Release ID (可选)
            
        Returns:
            Tuple[Release ID, 原始变更日志]
        """
        self.logger.info("📋 获取Release信息...")
        
        if mode == RunMode.AUTO_RELEASE and release_id:
            # 通过Release ID获取信息
            url = f"{self.github_api_base}/repos/{self.repo}/releases/{release_id}"
        else:
            # 通过标签获取信息
            url = f"{self.github_api_base}/repos/{self.repo}/releases/tags/{version}"
        
        response = requests.get(url, headers=self.github_headers)
        
        if response.status_code != 200:
            error_msg = f"无法获取Release信息: {response.json().get('message', '未知错误')}"
            self.logger.error(f"❌ {error_msg}")
            raise Exception(error_msg)
        
        release_data = response.json()
        release_id = str(release_data['id'])
        original_changelog = release_data.get('body', '')
        
        self.logger.info(f"✅ 获取到Release信息，ID: {release_id}")
        self.logger.info(f"📋 原始变更日志长度: {len(original_changelog)} 字符")
        
        return release_id, original_changelog
    
    def check_optimization_status(self, mode: RunMode, original_changelog: str) -> Tuple[bool, str]:
        """
        检查是否需要优化变更日志
        
        Args:
            mode: 运行模式
            original_changelog: 原始变更日志
            
        Returns:
            Tuple[是否需要优化, 处理后的原始内容]
        """
        self.logger.info("🔍 检查变更日志优化状态...")
        
        if mode == RunMode.MANUAL_OPTIMIZE:
            self.logger.info("📝 手动优化模式：强制重新生成，提取原始内容")
            
            # 检查是否包含AI优化标记和折叠区域
            if "<details>" in original_changelog and "查看原始提交记录" in original_changelog:
                self.logger.info("📋 发现折叠区域，提取原始提交记录...")
                
                # 提取折叠区域内容
                details_pattern = r'<details>.*?<summary>.*?</summary>(.*?)</details>'
                match = re.search(details_pattern, original_changelog, re.DOTALL)
                
                if match:
                    extracted_content = match.group(1).strip()
                    # 移除可能的HTML标签和空白字符
                    extracted_content = re.sub(r'^\s*\n+', '', extracted_content)
                    extracted_content = re.sub(r'\n+\s*$', '', extracted_content)
                    
                    if extracted_content and extracted_content != "暂无原始记录":
                        self.logger.info(f"✅ 成功提取到原始提交记录，内容长度: {len(extracted_content)} 字符")
                        return True, extracted_content
                    else:
                        self.logger.warning("⚠️ 折叠区域内容为空或无效，将从Git历史重新获取")
                        return True, ""
                else:
                    self.logger.info("ℹ️ 未发现有效的折叠区域格式，使用原始内容")
                    return True, original_changelog
            else:
                self.logger.info("ℹ️ 未发现折叠区域，使用原始内容")
                return True, original_changelog
        else:
            # 自动模式检查
            if "AI生成的变更日志摘要" in original_changelog:
                self.logger.warning("⚠️ 此Release已包含AI生成的变更日志")
                self.logger.info("🤖 自动模式，跳过重复优化")
                return False, original_changelog
            else:
                self.logger.info("✅ 变更日志未经AI优化，可以进行优化")
                return True, original_changelog
    
    def get_git_commits(self, version: str) -> Tuple[List[CommitInfo], str, int]:
        """
        获取Git提交信息
        
        Args:
            version: 当前版本标签
            
        Returns:
            Tuple[提交列表, 提交范围描述, 提交数量]
        """
        self.logger.info("📊 获取详细的提交信息...")
        self.logger.info(f"🎯 当前版本: {version}")
        
        try:
            # 获取所有标签并排序
            result = subprocess.run(
                ["git", "tag", "--sort=-version:refname"],
                capture_output=True, text=True, check=True
            )
            all_tags = [tag.strip() for tag in result.stdout.split('\n') if tag.strip()]
            
            # 找到上一个版本标签
            last_tag = None
            version_pattern = re.compile(r'^v?[0-9]+\.[0-9]+(\.[0-9]+)?.*$')
            
            for tag in all_tags:
                if tag != version and version_pattern.match(tag):
                    last_tag = tag
                    break
            
            # 确定提交范围
            if not last_tag:
                self.logger.info("📋 首次发布，获取到当前版本的所有提交记录")
                git_cmd = ["git", "log", version, "--pretty=format:%h|%s|%b", "--no-merges"]
                commit_range = f"初始版本到{version}"
            else:
                self.logger.info(f"📋 获取 {last_tag} 到 {version} 之间的提交记录")
                git_cmd = ["git", "log", f"{last_tag}..{version}", "--pretty=format:%h|%s|%b", "--no-merges"]
                commit_range = f"{last_tag}..{version}"
            
            # 执行Git命令获取提交
            result = subprocess.run(git_cmd, capture_output=True, text=True, check=True)
            commits_raw = result.stdout.strip()
            
            if not commits_raw:
                self.logger.warning("⚠️ 未获取到提交记录，尝试其他方法...")
                
                # 尝试包含合并提交
                if last_tag:
                    git_cmd = ["git", "log", f"{last_tag}..{version}", "--pretty=format:%h|%s|%b"]
                    result = subprocess.run(git_cmd, capture_output=True, text=True, check=True)
                    commits_raw = result.stdout.strip()
                
                # 如果还是为空，获取最近的提交
                if not commits_raw:
                    self.logger.info("🔄 获取最近的提交记录...")
                    git_cmd = ["git", "log", "--pretty=format:%h|%s|%b", "-n", "20"]
                    result = subprocess.run(git_cmd, capture_output=True, text=True, check=True)
                    commits_raw = result.stdout.strip()
                    commit_range = "最近20个提交"
            
            # 解析提交信息
            commits = []
            if commits_raw:
                for line in commits_raw.split('\n'):
                    parts = line.split('|', 2)
                    if len(parts) >= 2 and parts[0]:
                        commit = CommitInfo(
                            hash=parts[0],
                            message=parts[1].strip(),
                            body=parts[2].strip() if len(parts) > 2 else ""
                        )
                        commits.append(commit)
            
            commit_count = len(commits)
            self.logger.info(f"✅ 获取到 {commit_count} 个提交记录")
            
            if commit_count == 0:
                raise Exception("无法获取有效的提交记录")
            
            return commits, commit_range, commit_count
            
        except subprocess.CalledProcessError as e:
            self.logger.error(f"❌ Git命令执行失败: {e}")
            raise Exception(f"Git命令执行失败: {e}")
        except Exception as e:
            self.logger.error(f"❌ 获取提交信息失败: {e}")
            raise

    def classify_commits(self, commits: List[CommitInfo]) -> Dict[str, List[CommitInfo]]:
        """
        对提交进行分类
        
        Args:
            commits: 提交列表
            
        Returns:
            分类后的提交字典
        """
        self.logger.info("🆕 处理Git历史提交记录...")
        
        categories = self.templates["categories"]
        patterns = self.templates["commit_patterns"]
        
        classified = {category: [] for category in categories.keys()}
        
        for commit in commits:
            clean_message = commit.message.strip()
            categorized = False
            
            # 按优先级匹配分类
            for category, pattern in patterns.items():
                if category == "OTHER":
                    continue
                if re.match(pattern, clean_message, re.IGNORECASE):
                    commit.category = category
                    classified[category].append(commit)
                    categorized = True
                    break
            
            # 如果没有匹配到特定分类，归类为OTHER
            if not categorized:
                commit.category = "OTHER"
                classified["OTHER"].append(commit)
        
        # 打印分类统计
        self.logger.info("📊 初步分类统计:")
        for category, commits_list in classified.items():
            if commits_list:
                title, _ = categories[category]
                self.logger.info(f"  - {title}: {len(commits_list)}")
        
        return classified
    
    def call_deepseek_api(self, commits: List[CommitInfo]) -> Optional[AnalysisResult]:
        """
        调用DeepSeek API分析提交
        
        Args:
            commits: 提交列表
            
        Returns:
            AI分析结果，失败时返回None
        """
        self.logger.info("🧠 调用DeepSeek API进行智能分析和优化...")
        
        if not commits:
            self.logger.error("❌ 没有可用的提交数据可发送给AI")
            return None
        
        # 准备提交数据
        commits_text = ""
        for commit in commits:
            commits_text += f"{commit.hash}|{commit.message}\n"
        
        self.logger.info(f"✅ 准备发送给AI的数据长度: {len(commits_text)} 字符")
        
        # 构建API请求
        system_prompt = self.prompts["system_prompt"]
        user_prompt = self.prompts["user_prompt_template"].format(commits_text=commits_text)

        api_config = self.config["deepseek_api"]
        request_data = {
            "model": api_config["model"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": api_config["temperature"],
            "max_tokens": api_config["max_tokens"]
        }
        
        try:
            self.logger.info("📡 发送API请求...")            
            response = requests.post(
                f"{self.deepseek_api_base}/chat/completions",
                headers=self.deepseek_headers,
                json=request_data,
                timeout=api_config["timeout"]
            )
            
            self.logger.info(f"📊 API响应状态码: {response.status_code}")
            
            if response.status_code != 200:
                error_msg = f"HTTP错误 {response.status_code}: {response.json().get('error', {}).get('message', '未知HTTP错误')}"
                self.logger.error(f"❌ API调用HTTP错误: {error_msg}")
                return None
            
            response_data = response.json()
            
            if 'choices' not in response_data or not response_data['choices']:
                self.logger.error("❌ API响应格式异常: 缺少choices字段")
                return None
            
            ai_content = response_data['choices'][0]['message']['content']
            
            if not ai_content:
                self.logger.error("❌ AI响应内容为空")
                return None
            
            # 尝试解析JSON结果
            try:
                # 首先尝试直接解析
                ai_data = json.loads(ai_content)
                self.logger.info("✅ DeepSeek API调用成功 - 直接JSON格式")
                
                return AnalysisResult(
                    categories=ai_data.get('categories', {}),
                    summary=ai_data.get('summary', 'AI智能分析的版本更新'),
                    highlights=ai_data.get('highlights', [])
                )
                
            except json.JSONDecodeError:
                # 如果直接解析失败，尝试提取代码块中的JSON
                self.logger.info("🔄 直接JSON解析失败，尝试提取代码块中的JSON...")
                
                # 查找代码块模式: ```json ... ``` 或 ``` ... ```
                code_block_patterns = [
                    r'```json\s*(.*?)\s*```',
                    r'```\s*(.*?)\s*```'
                ]
                
                extracted_json = None
                for pattern in code_block_patterns:
                    match = re.search(pattern, ai_content, re.DOTALL)
                    if match:
                        extracted_json = match.group(1).strip()
                        self.logger.info(f"🔍 找到代码块，提取内容长度: {len(extracted_json)} 字符")
                        break
                
                if extracted_json:
                    try:
                        ai_data = json.loads(extracted_json)
                        self.logger.info("✅ DeepSeek API调用成功 - 代码块JSON格式")
                        
                        return AnalysisResult(
                            categories=ai_data.get('categories', {}),
                            summary=ai_data.get('summary', 'AI智能分析的版本更新'),
                            highlights=ai_data.get('highlights', [])
                        )
                        
                    except json.JSONDecodeError as e:
                        self.logger.warning(f"⚠️ 代码块中的JSON解析也失败: {e}")
                        self.logger.info(f"🔍 提取的内容前200字符: {extracted_json[:200]}...")
                else:
                    self.logger.warning("⚠️ 未找到有效的代码块格式")
                
                # 所有解析方法都失败
                self.logger.warning("⚠️ AI返回内容无法解析为有效JSON，使用基础分析结果")
                self.logger.info(f"🔍 AI原始返回内容前200字符: {ai_content[:200]}...")
                return None
                
        except requests.RequestException as e:
            self.logger.error(f"❌ API请求失败: {e}")
            return None
        except Exception as e:
            self.logger.error(f"❌ DeepSeek API调用异常: {e}")
            return None

    def generate_changelog_with_ai(self, version: str, ai_analysis: AnalysisResult, 
                                  original_changelog: str, commits: List[CommitInfo]) -> str:
        """
        使用AI分析结果生成变更日志
        
        Args:
            version: 版本号
            ai_analysis: AI分析结果
            original_changelog: 原始变更日志
            commits: 原始提交列表
            
        Returns:
            生成的变更日志
        """
        self.logger.info("📊 AI智能分析完成，开始生成优化变更日志...")
        
        template = self.templates["changelog_templates"]["ai_generated"]
        categories = self.templates["categories"]
        importance_icons = self.templates["importance_icons"]
        
        # 构建变更日志
        changelog = template["header"].format(version=version) + "\n\n"
        changelog += template["overview"].format(summary=ai_analysis.summary) + "\n"
        
        # 添加主要亮点
        if ai_analysis.highlights:
            highlights_text = "\n".join(f"- {highlight}" for highlight in ai_analysis.highlights)
            changelog += template["highlights"].format(highlights=highlights_text)
        
        changelog += template["divider"]
        
        # 按优先级生成各个分类
        categories_order = ["FEATURE", "FIX", "PERF", "STYLE", "REFACTOR", "DOCS", "BUILD", "OTHER"]
        
        for category in categories_order:
            if category in ai_analysis.categories and ai_analysis.categories[category]:
                title, _ = categories[category]
                changelog += "\n" + template["category_header"].format(title=title) + "\n"
                
                # 按重要性排序
                items = ai_analysis.categories[category]
                sorted_items = sorted(items, key=lambda x: x.get('importance', 1), reverse=True)
                
                for item in sorted_items:
                    importance = item.get('importance', 1)
                    icon = importance_icons.get(str(importance), "•")
                    message = item.get('message', '')
                    hash_val = item.get('hash', '')
                    
                    changelog += template["item_format"].format(
                        icon=icon, message=message, hash=hash_val
                    )
        
        # 添加原始变更记录到折叠区域
        changelog += "\n\n<details>\n<summary>查看原始提交记录</summary>\n\n"
        
        # 如果原始变更日志为空，则生成基础的提交记录
        if not original_changelog or original_changelog.strip() == "":
            self.logger.info("📝 原始变更日志为空，生成基础提交记录作为原始内容")
            basic_commits = []
            for commit in commits:
                basic_commits.append(f"- {commit.message} ({commit.hash})")
            original_changelog = "\n".join(basic_commits) if basic_commits else "暂无提交记录"
        
        changelog += original_changelog
        changelog += "\n\n</details>"
        
        return changelog
    
    def generate_changelog_basic(self, version: str, classified_commits: Dict[str, List[CommitInfo]], 
                               original_changelog: str) -> str:
        """
        使用基础规则生成变更日志
        
        Args:
            version: 版本号
            classified_commits: 分类后的提交
            original_changelog: 原始变更日志
            
        Returns:
            生成的变更日志
        """
        self.logger.info("🔄 使用基础逻辑生成变更日志...")
        
        template = self.templates["changelog_templates"]["basic_generated"]
        categories = self.templates["categories"]
        
        # 构建变更日志
        changelog = template["header"].format(version=version) + "\n\n"
        changelog += template["overview"] + template["divider"]
        
        # 按优先级生成各个分类
        categories_order = ["FEATURE", "FIX", "PERF", "STYLE", "REFACTOR", "DOCS", "BUILD", "OTHER"]
        
        for category in categories_order:
            if category in classified_commits and classified_commits[category]:
                title, _ = categories[category]
                changelog += "\n" + template["category_header"].format(title=title) + "\n"
                
                for commit in classified_commits[category]:
                    # 清理提交消息
                    clean_message = commit.message
                    
                    # 从配置获取清理规则
                    prefixes = self.templates.get("cleanup_patterns", [
                        r'^feat[:\s]*', r'^fix[:\s]*', r'^style[:\s]*', 
                        r'^refactor[:\s]*', r'^perf[:\s]*', r'^docs?[:\s]*', 
                        r'^build[:\s]*', r'^新增\s*', r'^修复\s*', r'^优化\s*'
                    ])
                    
                    for prefix in prefixes:
                        clean_message = re.sub(prefix, '', clean_message, flags=re.IGNORECASE)
                    
                    clean_message = clean_message.strip()
                    if not clean_message:
                        clean_message = commit.message
                    
                    changelog += template["item_format"].format(
                        message=clean_message, hash=commit.hash
                    )
        
        # 添加原始变更记录到折叠区域
        changelog += "\n\n<details>\n<summary>查看原始提交记录</summary>\n\n"
        
        # 如果原始变更日志为空，则生成基础的提交记录
        if not original_changelog or original_changelog.strip() == "":
            self.logger.info("📝 原始变更日志为空，生成基础提交记录作为原始内容")
            all_commits = []
            for category, commits_list in classified_commits.items():
                for commit in commits_list:
                    all_commits.append(f"- {commit.message} ({commit.hash})")
            original_changelog = "\n".join(all_commits) if all_commits else "暂无提交记录"
        
        changelog += original_changelog
        changelog += "\n\n</details>"
        
        return changelog

    def update_release_changelog(self, release_id: str, changelog: str) -> bool:
        """
        更新Release的变更日志
        
        Args:
            release_id: Release ID
            changelog: 新的变更日志内容
            
        Returns:
            是否更新成功
        """
        self.logger.info("📝 更新Release变更日志...")
        
        url = f"{self.github_api_base}/repos/{self.repo}/releases/{release_id}"
        
        update_data = {
            "body": changelog
        }
        
        try:
            response = requests.patch(url, headers=self.github_headers, json=update_data)
            
            if response.status_code == 200:
                release_data = response.json()
                self.logger.info("✅ Release变更日志更新成功")
                self.logger.info(f"🔗 Release URL: {release_data.get('html_url', '')}")
                return True
            else:
                error_msg = response.json().get('message', '未知错误')
                self.logger.error(f"❌ Release变更日志更新失败: {error_msg}")
                return False
                
        except Exception as e:
            self.logger.error(f"❌ 更新Release失败: {e}")
            return False
    
    def generate_summary_report(self, mode: RunMode, version: str, release_id: str,
                              classified_commits: Dict[str, List[CommitInfo]],
                              ai_success: bool, ai_error: Optional[str] = None) -> str:
        """
        生成执行摘要报告
        
        Args:
            mode: 运行模式
            version: 版本号
            release_id: Release ID
            classified_commits: 分类后的提交
            ai_success: AI是否成功
            ai_error: AI错误信息
            
        Returns:
            摘要报告文本
        """
        total_commits = sum(len(commits) for commits in classified_commits.values())
        
        # 控制台友好的报告格式
        console_report = f"""
{'='*60}
🤖 AI变更日志生成完成
{'='*60}

📋 基本信息:
  • 运行模式: {mode.value}
  • 版本号: {version}
  • Release ID: {release_id}

🤖 AI分析状态:
  • DeepSeek API: {'✅ 调用成功' if ai_success else '❌ 调用失败'}
  • 生成方式: {'🧠 AI智能生成' if ai_success else '📝 基础规则生成'}
"""
        
        if not ai_success and ai_error:
            console_report += f"  • 失败原因: {ai_error}\n"
        
        console_report += "\n📊 提交统计:\n"
        
        for category, commits_list in classified_commits.items():
            if commits_list:  # 只显示有内容的分类
                title, _ = self.templates["categories"][category]
                console_report += f"  • {title}: {len(commits_list)}\n"
        
        console_report += f"  • 总计: {total_commits}\n"
        
        console_report += f"""
⏱️ 执行信息:
  • 执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
  • 状态: {'✅ AI变更日志生成并更新成功' if ai_success else '⚠️ 变更日志生成并更新成功（使用基础规则）'}

{'='*60}
"""
        
        return console_report
    
    def output_github_actions_summary(self, mode: RunMode, version: str, release_id: str,
                                    classified_commits: Dict[str, List[CommitInfo]],
                                    ai_success: bool, ai_error: Optional[str] = None):
        """
        输出GitHub Actions摘要信息
        
        Args:
            mode: 运行模式
            version: 版本号
            release_id: Release ID
            classified_commits: 分类后的提交
            ai_success: AI是否成功
            ai_error: AI错误信息
        """
        # 输出到GitHub Actions Step Summary
        step_summary_file = os.getenv('GITHUB_STEP_SUMMARY')
        if step_summary_file:
            try:
                total_commits = sum(len(commits) for commits in classified_commits.values())
                
                summary_content = f"""# 🤖 AI变更日志生成报告

## 📋 执行概览
- **版本号**: `{version}`
- **运行模式**: `{mode.value}`
- **Release ID**: `{release_id}`
- **AI状态**: {'✅ 成功' if ai_success else '❌ 失败'}
- **生成方式**: {'🧠 AI智能生成' if ai_success else '📝 基础规则生成'}
- **处理提交数**: `{total_commits}`

## 📊 提交分类统计
"""
                
                for category, commits_list in classified_commits.items():
                    if commits_list:
                        title, _ = self.templates["categories"][category]
                        summary_content += f"- **{title}**: {len(commits_list)} 个提交\n"
                
                if not ai_success and ai_error:
                    summary_content += f"\n## ⚠️ 注意事项\n- AI API调用失败: {ai_error}\n- 已使用基础规则生成变更日志\n"
                
                summary_content += f"\n## ✅ 执行结果\n变更日志已成功更新到 Release 页面\n"
                
                with open(step_summary_file, 'w', encoding='utf-8') as f:
                    f.write(summary_content)
                
                self.logger.info("✅ GitHub Actions摘要已生成")
                
            except Exception as e:
                self.logger.warning(f"⚠️ 生成GitHub Actions摘要失败: {e}")
        
        # 输出GitHub Actions变量
        github_output_file = os.getenv('GITHUB_OUTPUT')
        if github_output_file:
            try:
                with open(github_output_file, 'a', encoding='utf-8') as f:
                    f.write(f"ai_success={str(ai_success).lower()}\n")
                    f.write(f"total_commits={sum(len(commits) for commits in classified_commits.values())}\n")
                    f.write(f"generation_mode={'ai' if ai_success else 'basic'}\n")
            except Exception as e:
                self.logger.warning(f"⚠️ 设置GitHub Actions输出变量失败: {e}")
    
    def get_all_releases(self) -> List[Dict[str, Any]]:
        """
        获取所有Release信息
        
        Returns:
            Release列表
        """
        self.logger.info("📋 获取所有Release信息...")
        
        all_releases = []
        page = 1
        per_page = 30
        
        while True:
            url = f"{self.github_api_base}/repos/{self.repo}/releases"
            params = {
                'page': page,
                'per_page': per_page
            }
            
            response = requests.get(url, headers=self.github_headers, params=params)
            
            if response.status_code != 200:
                error_msg = f"无法获取Release列表: {response.json().get('message', '未知错误')}"
                self.logger.error(f"❌ {error_msg}")
                raise Exception(error_msg)
            
            releases = response.json()
            
            if not releases:
                break
            
            all_releases.extend(releases)
            page += 1
            
            # 显示获取进度
            self.logger.info(f"📄 已获取 {len(all_releases)} 个Release...")
        
        self.logger.info(f"✅ 总共获取到 {len(all_releases)} 个Release")
        
        return all_releases
    
    def print_realtime_summary(self, release_tag: str, current: int, total: int, 
                              success: bool, ai_success: bool, error_msg: Optional[str] = None):
        """
        实时输出处理摘要
        
        Args:
            release_tag: Release标签
            current: 当前处理的序号
            total: 总数
            success: 是否成功
            ai_success: AI是否成功
            error_msg: 错误信息
        """
        elapsed_time = time.time() - self.batch_stats.start_time
        
        # 更新统计
        if success:
            self.batch_stats.success_count += 1
            if ai_success:
                self.batch_stats.ai_success_count += 1
        else:
            self.batch_stats.error_count += 1
        
        # 计算进度
        progress = (current / total) * 100
        
        # 估算剩余时间
        if current > 0:
            avg_time = elapsed_time / current
            remaining_time = avg_time * (total - current)
            remaining_str = f"{remaining_time/60:.1f}分钟" if remaining_time > 60 else f"{remaining_time:.0f}秒"
        else:
            remaining_str = "计算中..."
        
        # 实时摘要输出
        print(f"\n{'='*80}")
        print(f"🔄 批量处理进度: {current}/{total} ({progress:.1f}%)")
        print(f"📦 当前处理: {release_tag}")
        print(f"{'='*80}")
        
        print(f"📊 当前统计:")
        print(f"  ✅ 成功: {self.batch_stats.success_count}")
        print(f"  🧠 AI成功: {self.batch_stats.ai_success_count}")
        print(f"  ❌ 失败: {self.batch_stats.error_count}")
        print(f"  ⏩ 跳过: {self.batch_stats.skipped_count}")
        
        print(f"⏱️  时间信息:")
        print(f"  已用时: {elapsed_time/60:.1f}分钟")
        print(f"  预计剩余: {remaining_str}")
        
        if success:
            status = "🧠 AI智能生成" if ai_success else "📝 基础规则生成"
            print(f"✅ {release_tag} 处理完成 - {status}")
        elif error_msg == "SKIPPED":
            print(f"⏩ {release_tag} 已跳过 - 无需优化")
            self.batch_stats.skipped_count += 1
        else:
            print(f"❌ {release_tag} 处理失败")
            if error_msg:
                print(f"   错误: {error_msg}")
        
        print(f"{'='*80}\n")
        
        # 刷新输出确保实时显示
        sys.stdout.flush()
    
    def process_single_release(self, release_data: Dict[str, Any]) -> Tuple[bool, bool, Optional[str]]:
        """
        处理单个Release
        
        Args:
            release_data: Release数据
            
        Returns:
            Tuple[是否成功, AI是否成功, 错误信息]
        """
        tag_name = release_data['tag_name']
        release_id = str(release_data['id'])
        original_changelog = release_data.get('body', '')
        
        try:
            # 检查是否需要优化
            need_optimize, processed_changelog = self.check_optimization_status(
                RunMode.MANUAL_OPTIMIZE, original_changelog
            )
            
            if not need_optimize:
                return True, False, "SKIPPED"
            
            # 获取Git提交信息
            commits, commit_range, commit_count = self.get_git_commits(tag_name)
            self.batch_stats.total_commits += commit_count
            
            # 分类提交
            classified_commits = self.classify_commits(commits)
            
            # 尝试AI分析
            ai_analysis = self.call_deepseek_api(commits)
            ai_success = ai_analysis is not None
            
            # 生成变更日志
            if ai_success:
                changelog = self.generate_changelog_with_ai(tag_name, ai_analysis, processed_changelog, commits)
            else:
                changelog = self.generate_changelog_basic(tag_name, classified_commits, processed_changelog)
            
            # 更新Release
            success = self.update_release_changelog(release_id, changelog)
            
            return success, ai_success, None
            
        except Exception as e:
            return False, False, str(e)
    
    def run_batch_processing(self) -> bool:
        """
        运行批量处理所有Release
        
        Returns:
            是否整体执行成功
        """
        self.logger.info("🔄 开始批量处理所有Release...")
        
        try:
            # 获取所有Release
            all_releases = self.get_all_releases()
            
            if not all_releases:
                self.logger.warning("⚠️ 未找到任何Release")
                return True
            
            self.batch_stats.total_releases = len(all_releases)
            
            print(f"\n🚀 开始批量处理 {len(all_releases)} 个Release")
            print(f"⏱️ 开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("="*80)
            
            # 逐个处理Release
            for i, release_data in enumerate(all_releases, 1):
                tag_name = release_data['tag_name']
                
                try:
                    success, ai_success, error_msg = self.process_single_release(release_data)
                    self.print_realtime_summary(tag_name, i, len(all_releases), success, ai_success, error_msg)
                    
                    # 添加适当的延迟，避免API限制
                    if i < len(all_releases):
                        time.sleep(2)
                        
                except Exception as e:
                    self.logger.error(f"❌ 处理 {tag_name} 时发生异常: {e}")
                    self.print_realtime_summary(tag_name, i, len(all_releases), False, False, str(e))
                
                self.batch_stats.processed_releases = i
            
            # 输出最终统计
            self.print_final_batch_summary()
            
            # 输出GitHub Actions变量
            self._output_batch_github_actions()
            
            # 判断整体是否成功（成功率超过80%）
            success_rate = self.batch_stats.success_count / len(all_releases)
            return success_rate >= 0.8
            
        except Exception as e:
            self.logger.error(f"❌ 批量处理失败: {e}")
            return False
    
    def print_final_batch_summary(self):
        """输出最终批量处理摘要"""
        elapsed_time = time.time() - self.batch_stats.start_time
        success_rate = (self.batch_stats.success_count / self.batch_stats.total_releases) * 100
        ai_rate = (self.batch_stats.ai_success_count / max(1, self.batch_stats.success_count)) * 100
        
        print(f"\n{'='*80}")
        print(f"🎉 批量处理完成！")
        print(f"{'='*80}")
        
        print(f"📊 最终统计:")
        print(f"  📦 总Release数: {self.batch_stats.total_releases}")
        print(f"  ✅ 成功处理: {self.batch_stats.success_count}")
        print(f"  🧠 AI成功: {self.batch_stats.ai_success_count}")
        print(f"  ⏩ 跳过: {self.batch_stats.skipped_count}")
        print(f"  ❌ 失败: {self.batch_stats.error_count}")
        print(f"  📝 总提交数: {self.batch_stats.total_commits}")
        
        print(f"📈 成功率:")
        print(f"  📦 处理成功率: {success_rate:.1f}%")
        print(f"  🧠 AI成功率: {ai_rate:.1f}%")
        
        print(f"⏱️  时间统计:")
        print(f"  总用时: {elapsed_time/60:.1f}分钟")
        print(f"  平均每个: {elapsed_time/self.batch_stats.total_releases:.1f}秒")
        print(f"  完成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        print(f"{'='*80}")
    
    def _output_batch_github_actions(self):
        """输出批量处理的GitHub Actions变量"""
        github_output_file = os.getenv('GITHUB_OUTPUT')
        if github_output_file:
            try:
                with open(github_output_file, 'a', encoding='utf-8') as f:
                    f.write(f"ai_success={self.batch_stats.ai_success_count > 0}\n")
                    f.write(f"total_commits={self.batch_stats.total_commits}\n")
                    f.write(f"generation_mode=batch\n")
                    f.write(f"processed_releases={self.batch_stats.processed_releases}\n")
            except Exception as e:
                self.logger.warning(f"⚠️ 设置GitHub Actions输出变量失败: {e}")
        
        # GitHub Actions Step Summary
        step_summary_file = os.getenv('GITHUB_STEP_SUMMARY')
        if step_summary_file:
            try:
                elapsed_time = time.time() - self.batch_stats.start_time
                success_rate = (self.batch_stats.success_count / self.batch_stats.total_releases) * 100
                
                summary_content = f"""# 🔄 批量AI变更日志生成报告

## 📊 处理统计
- **总Release数**: `{self.batch_stats.total_releases}`
- **成功处理**: `{self.batch_stats.success_count}`
- **AI智能生成**: `{self.batch_stats.ai_success_count}`
- **跳过**: `{self.batch_stats.skipped_count}`
- **失败**: `{self.batch_stats.error_count}`

## 📈 性能指标
- **处理成功率**: `{success_rate:.1f}%`
- **总处理时间**: `{elapsed_time/60:.1f}分钟`
- **总提交数**: `{self.batch_stats.total_commits}`

## ✅ 执行结果
{'✅ 批量处理成功完成' if success_rate >= 80 else '⚠️ 批量处理部分失败'}
"""
                
                with open(step_summary_file, 'w', encoding='utf-8') as f:
                    f.write(summary_content)
                
            except Exception as e:
                self.logger.warning(f"⚠️ 生成GitHub Actions摘要失败: {e}")

    def run(self, version: Optional[str] = None, release_id: Optional[str] = None, 
           tag: Optional[str] = None, target: Optional[str] = None,
           event_name: str = "workflow_dispatch") -> bool:
        """
        运行AI变更日志生成流程
        
        Args:
            version: 版本号 (自动触发时使用)
            release_id: Release ID (自动触发时使用)
            tag: 标签 (旧版兼容)
            target: 目标版本或标签 (新版手动触发使用)
            event_name: 事件名称
            
        Returns:
            是否执行成功
        """
        try:
            # 1. 验证参数
            mode, final_version, final_release_id = self.validate_params(
                version, release_id, tag, target, event_name
            )
            
            # 2. 批量处理模式
            if mode == RunMode.BATCH_ALL:
                return self.run_batch_processing()
            
            # 3. 单个Release处理模式（原有逻辑）
            # 获取Release信息
            final_release_id, original_changelog = self.get_release_info(mode, final_version, final_release_id)
            
            # 检查是否需要优化
            need_optimize, processed_changelog = self.check_optimization_status(mode, original_changelog)
            
            if not need_optimize:
                self.logger.info("🚫 无需优化，流程结束")
                return True
            
            # 获取Git提交信息
            commits, commit_range, commit_count = self.get_git_commits(final_version)
            
            # 分类提交
            classified_commits = self.classify_commits(commits)
            
            # 尝试AI分析
            ai_analysis = self.call_deepseek_api(commits)
            ai_success = ai_analysis is not None
            ai_error = None if ai_success else "API调用失败"
            
            # 生成变更日志
            if ai_success:
                changelog = self.generate_changelog_with_ai(final_version, ai_analysis, processed_changelog, commits)
            else:
                changelog = self.generate_changelog_basic(final_version, classified_commits, processed_changelog)
            
            # 更新Release
            success = self.update_release_changelog(final_release_id, changelog)
            
            # 生成和输出摘要报告
            report = self.generate_summary_report(mode, final_version, final_release_id, 
                                                 classified_commits, ai_success, ai_error)
            
            # 输出到控制台
            print(report)
            
            # 输出到GitHub Actions
            self.output_github_actions_summary(mode, final_version, final_release_id, 
                                             classified_commits, ai_success, ai_error)
            
            return success
            
        except Exception as e:
            self.logger.error(f"❌ 执行失败: {e}")
            return False


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="AI变更日志生成器")
    
    # 新版参数
    parser.add_argument("--target", help="目标版本或标签（手动触发使用，如：v1.0.0 或 latest）")
    
    # 兼容旧版参数
    parser.add_argument("--version", help="版本号（自动触发使用）")
    parser.add_argument("--release-id", help="Release ID（自动触发使用）")
    parser.add_argument("--tag", help="标签（旧版兼容）")
    
    # 其他参数
    parser.add_argument("--event-name", default="workflow_dispatch", help="事件名称")
    parser.add_argument("--repo", help="GitHub仓库名(owner/repo)")
    parser.add_argument("--github-token", help="GitHub Token")
    parser.add_argument("--deepseek-api-key", help="DeepSeek API Key")
    
    args = parser.parse_args()
    
    # 从环境变量获取配置
    github_token = args.github_token or os.getenv("GITHUB_TOKEN")
    deepseek_api_key = args.deepseek_api_key or os.getenv("DEEPSEEK_API_KEY")
    repo = args.repo or os.getenv("GITHUB_REPOSITORY")
    
    if not github_token:
        print("❌ 缺少GitHub Token，请设置GITHUB_TOKEN环境变量或使用--github-token参数")
        sys.exit(1)
    
    if not deepseek_api_key:
        print("❌ 缺少DeepSeek API Key，请设置DEEPSEEK_API_KEY环境变量或使用--deepseek-api-key参数")
        sys.exit(1)
    
    if not repo:
        print("❌ 缺少仓库信息，请设置GITHUB_REPOSITORY环境变量或使用--repo参数")
        sys.exit(1)
    
    # 创建生成器并运行
    generator = AIChangelogGenerator(github_token, deepseek_api_key, repo)
    
    success = generator.run(
        version=args.version,
        release_id=args.release_id,
        tag=args.tag,
        target=args.target,
        event_name=args.event_name
    )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
