import web_webview from '@ohos.web.webview';
import hilog from '@ohos.hilog';

// ============ 配置区域 ============
const ONLINE_URL = 'https://paseo.app';          // 在线服务地址
const LOCAL_INDEX = 'resources/rawfile/index.html'; // 本地资源路径
const VERSION_CHECK_URL = 'https://paseo.app/version.json'; // 版本检测接口
const LOCAL_VERSION_KEY = 'paseo_local_version';   // 本地版本存储 key
const UPDATE_AVAILABLE_KEY = 'paseo_update_available'; // 有可用更新的标记
// ==================================

// 日志标签
const TAG = 'PaseoWebView';

// 界面状态
@Entry
@Component
struct Index {
  private webController: web_webview.WebviewController = new web_webview.WebviewController();
  @State currentUrl: string = '';
  @State isLoading: boolean = true;
  @State loadError: boolean = false;
  @State errorMessage: string = '';
  @State updateStatus: string = '';  // '', 'checking', 'available', 'downloading', 'ready'
  @State localVersion: string = '';
  @State onlineVersion: string = '';

  aboutToAppear() {
    hilog.info(0x0000, TAG, 'Paseo WebView starting...');
    this.initializeApp();
  }

  /**
   * 初始化应用
   * 策略：
   * 1. 优先加载本地资源（快速启动）
   * 2. 后台检测线上版本
   * 3. 如果有新版本，提示用户更新
   */
  private async initializeApp() {
    // 1. 先显示本地版本（快速启动）
    this.loadLocalContent();
    
    // 2. 后台检测版本（不阻塞主流程）
    this.checkForUpdates();
  }

  /**
   * 加载本地资源
   */
  private loadLocalContent() {
    hilog.info(0x0000, TAG, 'Loading local content');
    this.isLoading = true;
    this.loadError = false;
    this.currentUrl = LOCAL_INDEX;
  }

  /**
   * 加载在线内容
   */
  private loadOnlineContent() {
    hilog.info(0x0000, TAG, 'Loading online content');
    this.isLoading = true;
    this.loadError = false;
    this.currentUrl = ONLINE_URL;
  }

  /**
   * 检查更新
   * 从服务端获取最新版本号，与本地版本对比
   */
  private async checkForUpdates() {
    this.updateStatus = 'checking';
    
    try {
      // 构造版本检测请求
      // 注意：实际项目中需要在服务端提供一个 /version.json 接口
      // 返回格式: { "version": "1.0.86", "minAppVersion": "1.0.80", "releaseDate": "2024-01-01" }
      hilog.info(0x0000, TAG, 'Checking for updates from: %{public}s', VERSION_CHECK_URL);
      
      // 模拟版本检测（实际使用时请替换为真实接口）
      // 这里我们使用 WebView 来加载版本检测接口
      const versionInfo = await this.fetchVersionInfo();
      
      if (versionInfo) {
        this.onlineVersion = versionInfo.version;
        
        // 检查是否需要强制更新
        if (this.shouldUpdate(versionInfo)) {
          hilog.info(0x0000, TAG, 'Update available: %{public}s -> %{public}s', this.localVersion, this.onlineVersion);
          this.updateStatus = 'available';
        } else {
          hilog.info(0x0000, TAG, 'App is up to date');
          this.updateStatus = '';
        }
      }
    } catch (err) {
      hilog.error(0x0000, TAG, 'Failed to check updates: %{public}s', JSON.stringify(err));
      // 版本检测失败不影响主流程
      this.updateStatus = '';
    }
  }

  /**
   * 获取版本信息
   * 注意：这是一个模拟实现
   * 实际项目中需要服务端提供 /version.json 接口
   */
  private async fetchVersionInfo(): Promise<{ version: string; minAppVersion?: string; releaseDate?: string } | null> {
    // TODO: 实际实现时，需要服务端提供版本接口
    // 临时返回 null 表示不进行版本检测
    return null;
    
    /*
    // 实际实现示例：
    try {
      const response = await fetch(VERSION_CHECK_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      hilog.error(0x0000, TAG, 'Version fetch failed: %{public}s', JSON.stringify(e));
    }
    return null;
    */
  }

  /**
   * 判断是否需要更新
   */
  private shouldUpdate(versionInfo: { version: string; minAppVersion?: string }): boolean {
    // 获取本地版本（从应用配置或存储中）
    const localVer = this.getLocalVersion();
    
    if (!localVer) {
      // 没有本地版本记录，说明是首次安装
      return false;
    }
    
    // 版本号比较（简单的字符串比较，实际可能需要更复杂的版本比较逻辑）
    return this.compareVersions(versionInfo.version, localVer) > 0;
  }

  /**
   * 获取本地版本
   */
  private getLocalVersion(): string {
    // 从应用配置中获取版本
    // 注意：实际实现时可能需要从 AppStorage 或其他地方获取
    return this.localVersion;
  }

  /**
   * 版本号比较
   * 返回值: > 0 v1 > v2, = 0 v1 == v2, < 0 v1 < v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(p => parseInt(p, 10) || 0);
    const parts2 = v2.split('.').map(p => parseInt(p, 10) || 0);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * 执行更新
   * 将在线版本标记为可用，刷新页面即可加载最新版本
   */
  private applyUpdate() {
    hilog.info(0x0000, TAG, 'Applying update');
    this.updateStatus = '';
    // 刷新页面即可加载最新的在线版本
    // 由于当前 URL 指向本地，会自动回退到在线
    this.loadOnlineContent();
  }

  /**
   * 忽略更新
   * 继续使用当前版本
   */
  private dismissUpdate() {
    hilog.info(0x0000, TAG, 'Update dismissed');
    this.updateStatus = '';
    // 更新本地版本记录，避免频繁提示
    this.saveLocalVersion(this.onlineVersion);
  }

  /**
   * 保存本地版本
   */
  private saveLocalVersion(version: string) {
    this.localVersion = version;
    // TODO: 实际实现时需要持久化存储
    hilog.info(0x0000, TAG, 'Local version saved: %{public}s', version);
  }

  /**
   * 页面加载完成
   */
  private onPageEnd() {
    this.isLoading = false;
    // 保存当前版本为本地版本（如果之前没有）
    if (!this.localVersion && this.onlineVersion) {
      this.saveLocalVersion(this.onlineVersion);
    }
  }

  /**
   * 页面加载错误
   */
  private onErrorReceive(event: { error: web_webview.WebError }) {
    hilog.error(0x0000, TAG, 'WebView error: %{public}d - %{public}s', 
      event.error.errorCode, event.error.errorInfo);
    
    // 如果是本地资源加载失败，回退到在线
    if (this.currentUrl === LOCAL_INDEX && !this.loadError) {
      this.loadError = true;
      this.errorMessage = event.error.errorInfo;
      
      // 延迟切换到在线版本
      hilog.info(0x0000, TAG, 'Fallback to online after 1 second');
      setTimeout(() => {
        this.loadOnlineContent();
      }, 1000);
    } else {
      this.isLoading = false;
      this.loadError = true;
      this.errorMessage = event.error.errorInfo;
    }
  }

  /**
   * 刷新页面
   */
  private reload() {
    if (this.currentUrl === ONLINE_URL) {
      this.webController.refresh();
    } else {
      this.loadLocalContent();
    }
  }

  build() {
    Stack() {
      // ============ 主内容区 ============
      Column() {
        // WebView 主体
        Web({ src: this.currentUrl, controller: this.webController })
          .fileAccess(true)
          .javaScriptAccess(true)
          .domStorageAccess(true)
          .imageAccess(true)
          .mediaPlayGestureAccess(true)
          .geolocationAccess(true)
          .zoomAccess(true)
          .onPageEnd(() => {
            this.onPageEnd();
          })
          .onErrorReceive((event) => {
            this.onErrorReceive(event);
          })
          .layoutWeight(1)
          .width('100%')
          .height('100%')

        // ============ 更新提示 Banner ============
        if (this.updateStatus === 'available') {
          Column() {
            Row() {
              Column() {
                Text('发现新版本')
                  .fontSize(16)
                  .fontWeight(FontWeight.Medium)
                  .fontColor('#333333')
                Text(`版本 ${this.onlineVersion} 已发布`)
                  .fontSize(14)
                  .fontColor('#666666')
                  .margin({ top: 4 })
              }
              .alignItems(HorizontalAlign.Start)
              .layoutWeight(1)

              Row({ space: 12 }) {
                Button('忽略')
                  .fontSize(14)
                  .fontColor('#999999')
                  .backgroundColor('#F5F5F5')
                  .onClick(() => {
                    this.dismissUpdate();
                  })

                Button('更新')
                  .fontSize(14)
                  .fontColor('#FFFFFF')
                  .backgroundColor('#007AFF')
                  .onClick(() => {
                    this.applyUpdate();
                  })
              }
            }
            .width('100%')
            .padding(16)
          }
          .width('100%')
          .backgroundColor('#FFFFFF')
          .shadow({
            radius: 8,
            color: 'rgba(0,0,0,0.1)',
            offsetY: -2
          })
        }
      }
      .width('100%')
      .height('100%')

      // ============ 加载中覆盖层 ============
      if (this.isLoading) {
        Column() {
          LoadingProgress()
            .width(48)
            .height(48)
          Text('加载中...')
            .fontSize(14)
            .fontColor('#999999')
            .margin({ top: 16 })
        }
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(255,255,255,0.9)')
        .justifyContent(FlexAlign.Center)
      }

      // ============ 错误提示覆盖层 ============
      if (this.loadError && !this.isLoading) {
        Column() {
          Text('加载失败')
            .fontSize(20)
            .fontWeight(FontWeight.Medium)
            .fontColor('#333333')
          
          Text(this.errorMessage || '请检查网络连接')
            .fontSize(14)
            .fontColor('#999999')
            .margin({ top: 8, bottom: 24 })
            .textAlign(TextAlign.Center)
            .maxLines(3)

          Row({ space: 16 }) {
            Button('重试')
              .fontSize(16)
              .fontColor('#FFFFFF')
              .backgroundColor('#007AFF')
              .onClick(() => {
                this.reload();
              })

            Button('使用在线版')
              .fontSize(16)
              .fontColor('#007AFF')
              .backgroundColor('#F5F5F5')
              .onClick(() => {
                this.loadOnlineContent();
              })
          }
        }
        .width('80%')
        .maxWidth(320)
        .padding(32)
        .backgroundColor('#FFFFFF')
        .borderRadius(16)
        .shadow({
          radius: 16,
          color: 'rgba(0,0,0,0.15)',
          offsetY: 4
        })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#FFFFFF')
  }
}
