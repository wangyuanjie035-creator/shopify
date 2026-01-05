## HAOS 原生编译指南（WSL2 / Ubuntu，默认 rpi4_64）

本文档将给出一个无需 Docker 的 Home Assistant OS 原生编译流程，脚本已写好。按步骤执行即可在 WSL2 Ubuntu 上为 Raspberry Pi 4（`rpi4_64`）生成镜像，其他 ARM 板卡可通过参数切换。

### 0. 环境要求
- WSL2 Ubuntu（20.04/22.04 均可），可用的 `sudo` 权限与外网网络。
- 推荐：4 vCPU / 8 GB+ RAM，剩余磁盘空间 30~50 GB。
- 已安装 `bash`，默认家目录可写。

### 1. 获取脚本
将以下内容保存为 `build_haos_native.sh`（保持可执行权限）：

```bash
#!/bin/bash
set -euo pipefail
SCRIPT_START="$(date +%s)"

TARGET_BOARD="${1:-rpi4_64}"   # 可通过第一个参数切换板子
HAOS_DIR="$HOME/haos-build"
OUTPUT_DIR="$HAOS_DIR/output_${TARGET_BOARD}"
BR2_DL_DIR="$OUTPUT_DIR/dl"
BR_EXTERNAL_DIR="$HAOS_DIR/buildroot-external"

echo "== 0. 基础环境检查 =="
uname -a
lsb_release -a || true
free -h
df -h

echo "== 1. 安装依赖（如果未安装） =="
sudo apt update
sudo apt install -y build-essential git unzip wget xz-utils jq \
  skopeo bc bison flex libssl-dev ccache aria2 rsync file \
  python3 python3-pip mtools parted dosfstools

echo "== 2. DNS 锁定（防 WSL 下载失败） =="
sudo chattr -i /etc/resolv.conf 2>/dev/null || true
sudo bash -c 'cat >/etc/resolv.conf <<EOF
nameserver 8.8.8.8
nameserver 114.114.114.114
nameserver 1.1.1.1
EOF'
sudo chattr +i /etc/resolv.conf

echo "== 3. Git 优化（防止 submodule 卡死） =="
git config --global http.postBuffer 524288000

echo "== 4. 清理 PATH（Buildroot 敏感） =="
export PATH=$(echo $PATH | tr ":" "\n" | grep -v " " | tr "\n" ":" | sed "s/:$//")

echo "== 5. 克隆 HAOS 仓库 =="
rm -rf "$HAOS_DIR"
git clone https://github.com/home-assistant/operating-system.git "$HAOS_DIR"
cd "$HAOS_DIR"

echo "== 6. 初始化子模块 =="
git submodule update --init --recursive

echo "== 7. 准备 Buildroot 下载缓存目录 =="
mkdir -p "$BR2_DL_DIR"

echo "== 8. 清理旧输出 =="
rm -rf "$OUTPUT_DIR/build" "$OUTPUT_DIR/images"

echo "== 9. 检查 host-* 必备包 =="
HOST_PKGS=(libtool libcap util-linux)
for pkg in "${HOST_PKGS[@]}"; do
  echo "Checking host-$pkg..."
  if [ ! -f "$BR2_DL_DIR/host-$pkg.tar.xz" ]; then
    echo "WARN: host-$pkg 未在 dl 下，编译时可能联网下载"
  fi
done

echo "== 10. 加载 Buildroot 配置 =="
make O="$OUTPUT_DIR" BR2_EXTERNAL="$BR_EXTERNAL_DIR" "buildroot-external/configs/${TARGET_BOARD}_defconfig"

echo "== 11. 编译 HAOS（耐心等待） =="
make O="$OUTPUT_DIR" BR2_EXTERNAL="$BR_EXTERNAL_DIR" V=1

echo "== 12. 编译完成，输出目录 =="
ls -lh "$OUTPUT_DIR/images"

echo "🎉 HAOS 编译完成"
echo "镜像路径：$OUTPUT_DIR/images/haos_${TARGET_BOARD}-*.img.xz"

SCRIPT_END="$(date +%s)"
echo "总耗时: $((SCRIPT_END - SCRIPT_START)) 秒 (~$(( (SCRIPT_END - SCRIPT_START)/60 )) 分钟)"
```

### 2. 运行方式
```bash
chmod +x build_haos_native.sh
./build_haos_native.sh            # 默认编译 rpi4_64
./build_haos_native.sh odroid_c4  # 示例：切换其他板卡
```

### 3. 关键目录
- `HAOS_DIR=$HOME/haos-build`：仓库及构建主目录（脚本会先清空重新克隆）。
- `OUTPUT_DIR=$HAOS_DIR/output_<BOARD>`：Buildroot 输出目录。
- `BR2_DL_DIR=$OUTPUT_DIR/dl`：Buildroot 下载缓存，复用可节省重复下载。

### 4. 步骤速览（对应脚本日志）
- 依赖安装：APT 安装编译与工具链所需包。
- DNS 锁定：为 WSL2 修正 `resolv.conf`，避免解析异常。
- Git 优化：提升子模块拉取稳定性。
- PATH 清理：移除包含空格的 PATH 片段，避免 Buildroot 解析出错。
- 仓库准备：强制重新克隆 + 初始化 submodule。
- 缓存与输出：准备 `dl` 缓存并清理旧的 `build/images`。
- Buildroot 配置与编译：加载 `${TARGET_BOARD}_defconfig` 后直接 `make`。
- 产物查看：输出镜像位于 `output_<BOARD>/images/haos_<BOARD>-*.img.xz`。

### 5. 常见问题与提示
- DNS 被强制写入并加锁，若需还原可手动 `sudo chattr -i /etc/resolv.conf && sudo rm /etc/resolv.conf` 后按需重建。
- 过程会删除 `~/haos-build` 重新克隆，如需保留请先备份或修改脚本路径。
- 首次编译耗时较长（下载 Buildroot 组件），后续可保留 `dl` 缓存加速。
- 如遇下载失败可重试或手动预放 `host-*.tar.xz` 至 `dl`。

### 6. 清理
- 保留缓存：删除旧输出即可 `rm -rf ~/haos-build/output_<BOARD>/build ~/haos-build/output_<BOARD>/images`。
- 完全清理：`rm -rf ~/haos-build`。
