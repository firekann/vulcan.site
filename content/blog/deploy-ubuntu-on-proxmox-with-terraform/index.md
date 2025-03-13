---
title: Terraform으로 proxmox에 VM 생성하기
date: "2025-03-11T00:00:00Z"
description: "Terraform에 대해서"
tags: ["proxmox", "terraform", "ubuntu"]
---

# 시작
[이전 글](https://vulcan.site/build-ubuntu-image-for-proxmox-with-packer/)에서 [Packer](https://www.hashicorp.com/products/packer)를 이용해서 [proxmox](https://www.proxmox.com)에 ubuntu server [Template](https://pve.proxmox.com/wiki/VM_Templates_and_Clones)를 만들어봤다. Template를 clone 해서 VM을 생성함으로서 편하게 설정이 완료된 VM을 만들 수 있었다. 하지만 쿠버클러스터같이 같은 패키지를 설치한 비슷한 설정의 VM을 동시에 수십 혹은 수백 개를 생성해야 한다면, 이것을 모두 수동으로 clone하는 것은 쉽지 않을뿐더러 어리석은 짓이다. 그 때문에 이 글에서는 [Terraform](https://www.hashicorp.com/products/terraform)을 이용해서 k8s클러스터를 위한 VM 여러 개를 띄우는 과정을 자동화해 보겠다.

# 1. Terraform이란?
Terraform은 HashiCorp에서 개발한 인프라스트럭처를 코드로 관리(IaC, Infrastructure as Code)하는 도구다. 즉, 서버, 네트워크, 데이터베이스, 클라우드 리소스 등 다양한 인프라스트럭처를 선언적(configuration) 파일로 정의하고, 이를 기반으로 일관되고 자동화된 방식으로 배포, 수정, 삭제할 수 있다. Terraform은 이러한 특징들 덕분에 클라우드 인프라 운영 자동화와 관리의 복잡성을 크게 줄여준다.

# 2. install Terraform
기본적으로 Terraform의 설정에 관한 문서는 [여기](https://developer.hashicorp.com/terraform)에 아주 잘 정리돼 있다. ubuntu server noble에 설치할 거기 때문에 이 [튜토리얼](https://developer.hashicorp.com/terraform/install#linux)을 따라 하자.
```sh
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```
설치가 완료되고 `terraform --version`을 입력했을 때
```sh
~$ terraform --version
Terraform v1.10.5
on linux_amd64
```
이런 식으로 나온다면 설치가 완료된 것이다.

# 3. directory configuration
Terraform을 이용해서 proxmox에 VM을 생성하기 위해서는 Terraform코드(`vm-qemu-kube.tf`)와 proxmox에 접속하기 위한 credentials를 저장할 파일(`credentials.auto.tfvars`)과 proxmox provider정보 파일(`provider.tf`)이 필요하다. 그리고 각 VM마다 다른 정보를 변수화해 저장하기 위한 파일(`kube-cluster-config.auto.tfvars`)이 필요하다.
```css
terraform/
└── kube-cluster
    ├── credentials.auto.tfvars
    ├── kube-cluster-config.auto.tfvars
    ├── provider.tf
    └── vm-qemu-kube.tf
```

# 4. file configuration
ubuntu server noble(24.04.x)를 기준으로 진행하겠다.
## 4.1. provider.tf
Terraform이 proxmox와 상호작용 할 수 있도록 proxmox provider를 설정하는 파일이다. Terraform이 어떤 클라우드 서비스와 상호작용 해서 코드를 실행하기 위해선 클라우드 서비스 제공자(provider)에 대한 정보가 필요하다. 이 경우엔 proxmox가 클라우드 서비스 제공자이고, AWS, GCP 등 사용하는 클라우드 서비스에 따라 다를 수 있다.
```sh
terraform {
  required_version = ">= 0.13.0"

  required_providers {
    proxmox = {
      source = "telmate/proxmox"
      version = "3.0.1-rc6"
    }
  }
 }

variable "proxmox_api_url" {
  type = string
}

variable "proxmox_api_token_id" {
  type = string
  sensitive = true
}

variable "proxmox_api_token_secret" {
  type = string
  sensitive = true
}

variable "PUBLIC_SSH_KEY" {
  type = string
  sensitive = true
}

variable "USER" {
  type = string
}

variable "PASSWORD" {
  type = string
  sensitive = true
}

variable "vm_configs" {
  type = map(object({
    vmid = number
    ip   = string
    mac  = string
  }))
}

provider "proxmox" {
  pm_api_url          = var.proxmox_api_url
  pm_api_token_id     = var.proxmox_api_token_id
  pm_api_token_secret = var.proxmox_api_token_secret
  pm_tls_insecure     = true  #proxmox가 적절한 tls 인증서를 보유하고 있지 않을 경우 true로 해줘야한다.
}
```
* `proxmox_api_*`변수들은 모두 proxmox에 접속하기 위한 값들이다. 이전에 [Packer글](https://vulcan.site/build-ubuntu-image-for-proxmox-with-packer/)에서 사용했던 credentials과 유사하다.
* `PUBLIC_SSH_KEY`, `USER`, `PASSWORD`는 cloud-init을 통해 생성될 계정의 ssh key, username, password이다.
* `vm_configs`는 VM들을 생성할 때 각 VM마다 달라야 할 정보들을 변수로 지정하기 위함이다.

## 4.2. credentials.auto.tfvars
앞서 설명한 `provider.tf`에서 `vm_configs`을 제외한 변수의 값들을 저장하는 파일이다, 민감한 정보가 포함돼 있으니, 관리에 유의하도록 하자.
```sh
proxmox_api_url             = "https://YOUR_PROXMOX_IP:8006/api2/json"
proxmox_api_token_id        = "YOUR_USERNAME@REALM_NAME!tokenid"
proxmox_api_token_secret    = "TOKEN_SECRET"
USER     = "YOUR_USERNAME"
PASSWORD = "YOUR_PASSWORD"
PUBLIC_SSH_KEY = "YOUR_SSH_KEY"
```

## 4.3. kube-cluster-config.auto.tfvars
여러 VM을 생성하면 vmid, VM이름, vmbr의 MAC주소, IP주소 등 달라야 하는 값들이 있다. 그리고 여러 개의 VM을 한 번에 생성하려면 `vm-qemu-kube.tf`을 이 값들을 바꿔가며 여러 번 실행해야 한다. 이런 방식은 매우 번거롭고 Packer나 Terraform과 같은 IaC툴의 장점인 일관성 유지에 좋지 않은 방법이다. 때문에 이것들도 변수로 만들어 관리하는게 좋다.
```sh
vm_configs = {
  control01 = {
    vmid = 811
    ip   = "ip=192.168.80.11/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:11"
  },
  control02 = {
    vmid = 812
    ip   = "ip=192.168.80.12/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:12"
  },
  control03 = {
    vmid = 813
    ip   = "ip=192.168.80.13/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:13"
  },
  worker01 = {
    vmid = 831
    ip   = "ip=192.168.80.31/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:31"
  },
  worker02 = {
    vmid = 832
    ip   = "ip=192.168.80.32/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:32"
  },
  worker03 = {
    vmid = 833
    ip   = "ip=192.168.80.33/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:33"
  },
  worker04 = {
    vmid = 834
    ip   = "ip=192.168.80.34/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:34"
  },
  worker05 = {
    vmid = 835
    ip   = "ip=192.168.80.35/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:35"
  },
  worker06 = {
    vmid = 836
    ip   = "ip=192.168.80.36/24,gw=192.168.80.1"
    mac  = "bc:24:11:00:08:36"
  }
}
```
나의 경우에는 kubernetes control plane 3개, worker node 6개 총 9개의 VM을 생성했다. 각각의 control01, control02, ..., worker06은 VM의 이름이 되고, vmid, ip, mac주소를 지정해 줬다. 나는 pfsense 를 쓰고 있기 때문에 VLAN tag 80번에 192.168.80.0/24인 VLAN을 만들고, 192.168.80.1 ~ 192.168.80.100까지를 static IP대역으로 지정하고, 미리 static IP table에 IP와 MAC 주소를 맵핑해줬다. 사용하고 있는 라우터의 종류에 따라 미리 설정해줘야한다.

## 4.4. vm-qemu-kube.tf
여기서 사용되는 값들에 대한 상세는 [여기](https://registry.terraform.io/providers/Terraform-for-Proxmox/proxmox/latest/docs/resources/vm_qemu)를 참고하자. 그리고 여기서 사용하는 대부분의 값들은 proxmox VM의 Hardware나 Option의 특정 값과 매칭되는 부분이 많으니 어떤 값으로 설정해야 할지 모르겠다면 기존에 사용하고 있던 VM의 값들을 참고하면 좋다.
`vm-qemu-kube.tf`는 qemu VM을 띄우기 위한 설정 파일이다. `kube-cluster-config.auto.tfvars`에 있는 `vm_configs`를 하나씩 순회하면서 반복 실행하기 위해 `for_each`를 이용했다.
```sh
resource "proxmox_vm_qemu" "kube" {

  for_each = var.vm_configs
  
  # -- General settings

  name        = each.key
  desc        = "kubernetes cluster"
  agent       = 1  # <-- (Optional) Enable QEMU Guest Agent
  target_node = "pve"  # <-- Change to the name of your Proxmox node (if you have multiple nodes)
  tags        = "ubuntu_noble,kubernetes"
  vmid        = each.value.vmid
  #pool        = ""

  # -- Template settings

  clone_id   = 800  # <-- Change to the name of the template or VM you want to clone
  full_clone = true  # <-- (Optional) Set to "false" to create a linked clone

  # -- Boot Process

  onboot           = true
  startup          = ""  # <-- (Optional) Change startup and shutdown behavior
  automatic_reboot = false  # <-- Automatically reboot the VM after config change

  # -- Hardware Settings

  #qemu_os  = "l26"
  #bios     = "ovmf"
  #machine  = "q35"
  cores    = 2
  sockets  = 1
  #cpu_type = "host"
  memory   = 4096
  balloon  = 0  # <-- (Optional) Minimum memory of the balloon device, set to 0 to disable ballooning
  numa     = false

  # -- Network Settings

  network {
    id       = 0  # <-- ! required since 3.x.x
    bridge   = "vmbr0"
    model    = "virtio"
    firewall = false
    tag      = 80
    macaddr  = each.value.mac
  }

  # -- Disk Settings
  
  scsihw = "virtio-scsi-single"  # <-- (Optional) Change the SCSI controller type, since Proxmox 7.3, virtio-scsi-single is the default one         
  
  disks {  # <-- ! changed in 3.x.x
    ide {
      ide0 {
        cloudinit {
          storage = "local-zfs"
        }
      }
    }
    virtio {
      virtio0 {
        disk {
          storage   = "local-zfs"
          size      = "20G"  # <-- Change the desired disk size, ! since 3.x.x size change will trigger a disk resize
          iothread  = true  # <-- (Optional) Enable IOThread for better disk performance in virtio-scsi-single
          replicate = false  # <-- (Optional) Enable for disk replication
        }
      }
    }
  }

  # -- Cloud Init Settings

  ipconfig0  = each.value.ip  # <-- Change to your desired IP configuration
  nameserver = "192.168.80.1"  # <-- Change to your desired DNS server
  ciuser     = var.USER
  cipassword = var.PASSWORD
  ciupgrade  = false
  sshkeys    = var.PUBLIC_SSH_KEY  # <-- (Optional) Change to your public SSH key
}
```
* General settings
    * name        : VM의 이름이다. 여기서는 `vm_configs`의 key값을 사용한다.
    * desc        : VM의 디스크립션이다.
    * agent       : proxmox option의 QEMU Guest agent를 true로 할지 여부이다.
    * target_node : 만약 proxmox cluster를 구성해서 proxmox node가 여러 개이면 target_node로 원하는 proxmox node의 이름을 적어준다
    * tags        : proxmox의 tag를 지정해 준다. 여러 개 tag를 지정하려면 `,`로 구분해 준다.
    * vmid        : 생성될 VM의 vmid이다. vmid는 유니크해야 한다. 여기서는 `vm_configs`의 value.vmid값을 사용한다.
    * pool        : 해당 VM이 생성되길 원하는 pool이 있다면 그 이름을 적어준다. pool 구성을 한 기억이 없다면 생략해도 된다.
* Template settings
    * clone_id   : clone할 VM의 vmid이다. [이전 글](https://vulcan.site/build-ubuntu-image-for-proxmox-with-packer/)을 참고해 만든 Packer로 생성한 VM의 vmid를 적어준다.
    * full_clone : proxmox에는 [clone옵션](https://pve.proxmox.com/wiki/VM_Templates_and_Clones)이 full clone과 linked clone이 있다. 이 부분은 주의할 필요가 있다. proxmox cluster를 운영 중이라면 분명 migration기능을 이용했을 것이다. migration기능을 이용하려면 linked clone을 해서는 안 된다. linked clone을 하게되면 clone된 VM의 디스크가 원본 VM의 디스크 위치에 종속되기 때문에 별개로 다른 node로 이동이 불가능하다. 또한 원본 VM의 수정 또한 불가하다. 다만 linked clone은 full clone에 비해서 clone 속도가 굉장히 빠르고 디스크 소모 또한 적다. 때문에 테스트 용으로는 `false`로 해서 linked clone을 사용하고 실질적으로 배포해야 할 땐 full clone을 이용하기를 개인적으로 권장한다.(이 부분은 개인적인 경험을 바탕으로 작성됐다. 옳지 않은 부분이 있을 수 있다.)
* Boot Process
    * onboot           : 생성하고 부팅할 건지 여부이다.
    * startup          : [여길](https://pve.proxmox.com/pve-docs/pve-admin-guide.html#pct_startup_and_shutdown) 참고하자.
    * automatic_reboot : VM 설정에 변경이 생겼을 때 자동으로 reboot 해주는 기능. (e.g. cpu core 수 변경, 메모리 용량 변경 등)
* Hardware Settings
    * qemu_os  : QEMU os type
    * bios     : bios type
    * machine  : machine type
    * cores    : CPU 코어 수
    * sockets  : CPU 소켓 수
    * cpu_type : CPU type
    * memory   : 메모리 용량(MiB)
    * balloon  : 메모리 balloon 최소 용량. 0으로 하면 ballooning이 비활성화됨
    * numa     : numa 활성화
* Network Settings
    * id       : [문서](https://registry.terraform.io/providers/Terraform-for-Proxmox/proxmox/latest/docs/resources/vm_qemu#network-block)에는 불분명하게 적혀있으나 Network Device의 id(e.g. net0, net1, ...)을 지정하는 것으로 보인다. 문서에는 순서에 따라 id가 정해진다고 돼 있으나 3.x.x버전 이후로 명시하도록 변경된 것 같다.
    * bridge   : proxmox의 network bridge의 이름을 적어주면 된다. network bridge를 생성한 적이 없다면 기본으로 vmbr0가 있을 것이다.
    * model    : 생성될 Network Device의 model을 입력한다. [문서](https://registry.terraform.io/providers/Terraform-for-Proxmox/proxmox/latest/docs/resources/vm_qemu#network-block)를 참고하자.
    * firewall : 방화벽 적용 여부이다. proxmox에서 방화벽을 설정하지 않고 pfsense나 opnsense같은 소프트웨어로 관리하고 있다면 false로 해도 문제없다.
    * tag      : VLAN tag의 번호이다. VLAN을 사용하고 있지 않다면 `-1`로 하거나 주석 처리해 준다.
    * macaddr  : Network Device의 MAC주소이다. 지정하지 않으면 랜덤으로 설정되기 때문에 static IP를 설정하기에 적절하지 않다. 사용하고 있는 DHCP서버에서 미리 static IP설정을 완료해 주고 설정한 MAC주소를 `vm_configs`의 mac에 적어준 다음 여기서 `each.value.mac`으로 불러와 준다.
* Disk Settings
    * scsihw : SCSI 컨트롤러 type을 지정해 준다.
    * disks : 어떤 디스크 Bus/Device로 디스크를 생성해 줄 건지 정한다.(ide, sata, virtio, scsi)
        * ide0 : ide0으로 cloudinit을 위한 디스크를 생성해 준다.
            * storage : proxmox의 어떤 스토리지에 생성할지를 정한다. 생성할 스토리지는 proxmox storage content에서 Disk image를 포함해야 한다. 기본적으로는 local-zfs나 local-lvm이 있을 것이다. 처음에 zfs로 생성했다면 local-zfs를 ext4로 생성했다면 local-lvm을 사용하면 된다.
        * virtio0 : virtio0로 부팅할 디스크를 생성해 준다.
            * storage : 위의 ide0의 설명과 같다. 디스크가 생성되길 원하는 다른 storage가 있다면 해당 storage의 content를 확인하고, 해당 storage의 이름을 적어주면 된다.
            * size : 생성될 디스크의 크기를 지정한다. `regex \d+[GMK]`를 따라서 원하는 용량으로 생성해 준다. 
            * iothread : IOThread 사용 여부이다. `scsihw`가 `virtio-scsi-single`이고, `disks`의 type이 `virtio`나 `scsi`일 때만 유효하다.
            * replicate : replication 사용 여부이다.
* Cloud Init Settings
    * ipconfig0  : 설정할 IP 주소이다. 위의 Network에서의 MAC주소와 같이 `vm_configs`의 `each.value.ip`로 불러와 준다.
    * nameserver : 사용할 DNS 서버의 주소를 적으면 된다.
    * ciuser     : 생성할 USER의 이름이다. var.USER로 `credentials.auto.tfvars`에서 설정한 USER를 불러와 준다.
    * cipassword : 생성할 PASSWORD이다. var.USER로 `credentials.auto.tfvars`에서 설정한 PASSWORD를 불러와 준다.
    * ciupgrade  : 부팅할 때 패키지 업그레이드를 할지 여부이다.(apt upgrade)
    * sshkeys    : 생성할 PUBLIC_SSH_KEY이다. var.USER로 `credentials.auto.tfvars`에서 설정한 PUBLIC_SSH_KEY를 불러와 준다.

# 5. plan and apply
Terraform에선 Packer와 다르게 plan과 apply가 있다. plan은 현재 구성돼있는 인프라 구성과 적용할 구성을 비교해서 차이를 출력해 준다. apply는 현재 구성을 적용해 준다. 기본적으로 apply를 하기 전에 plan으로 변경되는 부분을 확인하는 편이 바람직하다. 먼저 `terraform plan`을 해준다.
```sh
~$ terraform plan
proxmox_vm_qemu.kube["worker05"]: Refreshing state... [id=pve/qemu/835]
proxmox_vm_qemu.kube["worker06"]: Refreshing state... [id=pve/qemu/836]
proxmox_vm_qemu.kube["worker02"]: Refreshing state... [id=pve/qemu/832]
proxmox_vm_qemu.kube["worker01"]: Refreshing state... [id=pve/qemu/831]
proxmox_vm_qemu.kube["control02"]: Refreshing state... [id=pve/qemu/812]
proxmox_vm_qemu.kube["worker03"]: Refreshing state... [id=pve/qemu/833]
proxmox_vm_qemu.kube["worker04"]: Refreshing state... [id=pve/qemu/834]
proxmox_vm_qemu.kube["control01"]: Refreshing state... [id=pve/qemu/811]
proxmox_vm_qemu.kube["control03"]: Refreshing state... [id=pve/qemu/813]

No changes. Your infrastructure matches the configuration.

Terraform has compared your real infrastructure against your configuration and found no differences, so no changes are needed.
```
한번 적용하고 다시 plan을 했다면 위와 같이 표시될 것이다. 처음이라면 변경되는 부분이 표시된다.

이제 `apply`를 해보자.
```sh
~$ terraform apply -auto-approve
proxmox_vm_qemu.kube["worker03"]: Refreshing state... [id=pve/qemu/833]
proxmox_vm_qemu.kube["worker01"]: Refreshing state... [id=pve/qemu/831]
proxmox_vm_qemu.kube["worker04"]: Refreshing state... [id=pve/qemu/834]
proxmox_vm_qemu.kube["control01"]: Refreshing state... [id=pve/qemu/811]
proxmox_vm_qemu.kube["control03"]: Refreshing state... [id=pve/qemu/813]
proxmox_vm_qemu.kube["worker06"]: Refreshing state... [id=pve/qemu/836]
proxmox_vm_qemu.kube["control02"]: Refreshing state... [id=pve/qemu/812]
proxmox_vm_qemu.kube["worker05"]: Refreshing state... [id=pve/qemu/835]
proxmox_vm_qemu.kube["worker02"]: Refreshing state... [id=pve/qemu/832]

Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # proxmox_vm_qemu.kube["control01"] will be created
  + resource "proxmox_vm_qemu" "kube" {
      + additional_wait        = 5
      + agent                  = 1
      + automatic_reboot       = false
      + balloon                = 0
      + bios                   = "seabios"
      + boot                   = (known after apply)
      + bootdisk               = (known after apply)
      + cipassword             = (sensitive value)
      + ciupgrade              = false
      + ciuser                 = "kube"
      + clone_id               = 800
      + clone_wait             = 10
      + cores                  = 2
      + cpu_type               = "host"
      + default_ipv4_address   = (known after apply)
      + default_ipv6_address   = (known after apply)
      + define_connection_info = true
      + desc                   = "kubernetes cluster"
      + force_create           = false
      + full_clone             = false
      + hotplug                = "network,disk,usb"
      + id                     = (known after apply)
      + ipconfig0              = "ip=192.168.80.11/24,gw=192.168.80.1"
...
proxmox_vm_qemu.kube["worker01"]: Still creating... [2m20s elapsed]
proxmox_vm_qemu.kube["worker01"]: Creation complete after 2m21s [id=pve/qemu/831]
proxmox_vm_qemu.kube["worker05"]: Still creating... [2m30s elapsed]
proxmox_vm_qemu.kube["worker03"]: Still creating... [2m30s elapsed]
proxmox_vm_qemu.kube["worker05"]: Still creating... [2m40s elapsed]
proxmox_vm_qemu.kube["worker03"]: Still creating... [2m40s elapsed]
proxmox_vm_qemu.kube["worker03"]: Creation complete after 2m41s [id=pve/qemu/833]
proxmox_vm_qemu.kube["worker05"]: Still creating... [2m50s elapsed]
proxmox_vm_qemu.kube["worker05"]: Still creating... [3m0s elapsed]
proxmox_vm_qemu.kube["worker05"]: Creation complete after 3m0s [id=pve/qemu/835]

Apply complete! Resources: 9 added, 0 changed, 0 destroyed.
```
`-auto-approve`를 하면 자동으로 과정이 진행돼 위와 같이 끝날 것이다. 그냥 `terraform apply`를 하면 변경되는 부분을 보여주고, approve 할건지를 알려준다. approve 하게 되면 과정이 진행돼 똑같이 VM이 생성되면 종료된다. 나의 경우 linked clone으로 하면 3분 정도, full clone으로 하면 8분 30초 정도가 소요됐다. 사용하는 디스크의 속도에 따라 다를 수 있다.

# 결론
[이전 글](https://vulcan.site/build-ubuntu-image-for-proxmox-with-packer/)에서 [Packer](https://www.hashicorp.com/products/packer)를 이용해 proxmox에 VM Template를 생성하는 방법에 대해서 다뤘다. 그리고 이번 글에서 Terraform으로 생성된 VM Template를 이용해 여러 개의 VM을 일관적으로 손쉽게 생성하고 관리하는 방법에 대해서 소개했다. 이 두 가지 IaC 도구를 사용해 proxmox에서 VM을 쉽게 생성하고 관리할 수 있고, 일관적이고 빠른 배포를 할 수 있게 됐다. proxmox를 사용하는 많은 사람들에게 도움이 됐으면 한다.

다음 글에서는 생성된 VM에 ansible을 이용해 kubernetes cluster를 구성하고, kubernetes 대시보드를 생성하고, worker node를 추가, 제거할 수 있는 방법을 소개하려고 한다.

잘못된 설명이나 추가로 설명했으면 좋겠는 부분, 오타, 맞춤법에 대한 지적은 언제나 환영합니다.

* 이 글을 홈서버 사용자를 위한 것입니다. 실제 환경에서 사용할 때는 credential을 Vault나 환경 변수 등으로 좀 더 엄격하게 관리하시기를 바랍니다.
* 이 글을 포함해 인터넷에 존재하는 코드, 스크립트를 복사해 사용할 때는 코드, 스크립트를 충분히 읽고, 분석하여 문제가 없는지 확인하시기를 바랍니다. 최소한 ChatGPT 같은 AI에 해당 코드, 스크립트가 정말 안전하고 사용해도 되는지 확인받으시길 권장합니다.

# 참고
[ChristianLempa](https://github.com/ChristianLempa) github/boilerplates

https://github.com/ChristianLempa/boilerplates/tree/main/terraform/proxmox

[HashiCorp Terraform](https://developer.hashicorp.com/terraform)

https://registry.terraform.io/providers/Terraform-for-Proxmox/proxmox/latest/docs