---
title: 우분투 lvm 확장하기
date: "2023-10-02T00:00:00Z"
description: "expand ubuntu lvm"
tags: ["server", "ubuntu"]
---

# 0 환경

-   proxmox 7.4
-   ubuntu 20.04 VM
-   확장하기 전 상태는 아래와 같다.

![df-h_before](./df-h_before.png)

# 1 과정

-   우분투 머신에 디스크를 추가해준다.

```sh
sudo su
fdisk -l | grep "/dev/sd"
```

-   추가한 디스크 확인

![fdisk](./fdisk.png)

-   pvscan해서 확인 후 `pvcreate`로 추가한 디스크를 볼륨에 추가한다.

```sh
pvscan
pvcreate /dev/sdb
pvscan
```

![pvcreate](./pvcreate.png)

-   이후 `vgextend`로 VG에 추가해줍니다.

```sh
vgextend ubuntu-vg /dev/sdb
```

![vgextend](./vgextend.png)

-   `lvscan`으로 용량을 확장할 lvm의 경로를 확인합니다.

```sh
lvscan
```

![lvscan](./lvscan.png)

-   `lvextend -l +100%FREE -n [lvm 경로]`로 확장.

```sh
lvextend -l +100%FREE -n /dev/ubuntu-vg/ubuntu-lv
```

![lvextend](./lvextend.png)

-   `resize2fs`로 확장.

```sh
resize2fs /dev/ubuntu-vg/ubuntu-lv
```

![resize2fs](./resize2fs.png)

-   `df -h`로 확장됐는지 확인.

```sh
df -h
```

![df-h_after](./df-h_after.png)

# 참고

https://nirsa.tistory.com/232
