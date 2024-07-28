---
title: How to Fix Telegraf Errors After Upgrading to pfSense 2.7
date: "2024-07-28T00:00:00Z"
description: "pfSense Telegraf Error"
tags: ["server", "pfSense", "error"]
---

# 1 Error

After upgrading from pfSense CE version 2.6 to version 2.7, I encountered the following error continuously:

```
PHP Fatal error: Uncaught TypeError: implode(): Argument #1 ($pieces) must be of type array, string given in /usr/local/pkg/telegraf.inc:132
Stack trace:
#0 /usr/local/pkg/telegraf.inc(132): implode(',', NULL)
#1 /etc/inc/pkg-utils.inc(709) : eval()'d code(1): telegraf_resync_config()
#2 /etc/inc/pkg-utils.inc(709): eval()
#3 /etc/rc.start_packages(66): sync_package('Telegraf')
#4 {main}
thrown in /usr/local/pkg/telegraf.inc on line 132
```

Additionally, I noticed that the option to manage Telegraf settings through the GUI, which was previously accessible under Service -> Telegraf, has disappeared. Telegraf in pfSense is responsible for sending collected information to a database. However, with this error, Telegraf no longer functions.

By uninstalling Telegraf, restarting pfSense, and then reinstalling Telegraf immediately after the restart, it resumes working with the previous settings. Despite this, the error persists and GUI access remains unavailable.

## 2 Why Does This Error Occur?

### 2.1 Code Causing the Error

The error occurs in the `telegraf.inc` file. This file contains the code responsible for performing the `telegraf_resync_config` task, which resynchronizes the `/usr/local/etc/telegraf.conf` file according to the configuration values. This task is executed when Telegraf settings are changed via the GUI or when Telegraf is reinstalled (there might be additional conditions, but these two are confirmed).

First, let's examine the code where the error occurs. You can view this using pfSense's Edit File feature.

```PHP
//      /usr/local/pkg/telegraf.inc
        /* Ping Monitor Configuration */
        if ($telegraf_conf["ping_enable"]) {
                if (!empty($telegraf_conf['ping_host_1'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_1"] . '"';
                }
                if (!empty($telegraf_conf['ping_host_2'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_2"] . '"';
                }
                if (!empty($telegraf_conf['ping_host_3'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_3"] . '"';
                }
                if (!empty($telegraf_conf['ping_host_4'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_4"] . '"';
                }

                $monitor_hosts = implode(",", $monitor_hosts);      // line 132

                $cfg .= "\n[[inputs.ping]]\n";
                $cfg .= "\turls = [" . $monitor_hosts . "]";
                $cfg .= "\n\tdeadline = 0\n\n"; /* deadline (-w) function not supported in BSD ping */
        }
```

Examining the code at the line where the error occurs, the values of `ping_host_*` are fetched from `$telegraf_conf` and formatted as follows:

```
[[inputs.ping]]
	urls = ["host.1.ip.addr","host.2.ip.addr","host.3.ip.addr","host.4.ip.addr"]
	deadline = 0
```

This section allows Telegraf to send ping messages to specified IP addresses and receive results to verify if the target servers are alive. It is not a mandatory feature and can be disabled in the pfSense Telegraf settings.

### 2.2 Location of the Error

The error message indicates that the error occurs at line 132 of `telegraf.inc` due to `implode(',', NULL)`. When examining line 132 of the `telegraf.inc` file, the code `$monitor_hosts = implode(",", $monitor_hosts);` is found, implying that `$monitor_hosts` is `NULL`. Why does this happen? Before line 132, the `if` statements attempt to add `ping_host_*` values to the `$monitor_hosts` array. If there are no `ping_host_*` values in `telegraf_conf`, `$monitor_hosts` remains empty.

In PHP, variables are automatically created when they are first used, even if they are not explicitly initialized. However, if a variable is not explicitly initialized, it can have a `NULL` value. Therefore, if none of the conditions in the `if` statements are satisfied, `$monitor_hosts` can end up being `NULL`.

pfSense CE 2.7 uses PHP version 8. In PHP 8, calling `implode` with a `NULL` value is not allowed. As a result, the format `implode(',', NULL)` will trigger an error.

This change in PHP's behavior means that the previously acceptable code now results in an error in pfSense 2.7. The solution involves ensuring that `$monitor_hosts` is always initialized as an array before it is used in the `implode` function. This can be done by initializing `$monitor_hosts` as an empty array before the `if` statements.

### 2.3 Why Did the Error Occur After the Upgrade?

Reviewing the pfSense CE 2.7 upgrade notes, it becomes clear that the PHP version was upgraded from 7.4.X to 8.2.6. In PHP 7, it was permissible to call `implode` with a `NULL` value. Depending on the implementation, the return value of `implode` could be either `NULL` or an empty string. Therefore, even if `$monitor_hosts` contained nothing, no error would occur.

However, as previously explained, PHP 8 enforces stricter type checking. As a result, calling `implode` with a `NULL` value triggers an error. Consequently, when upgrading from pfSense 2.6 to 2.7, the PHP version was also upgraded to version 8, which introduced this issue.

The change in PHP's behavior due to the version upgrade directly caused the problem. The code that worked correctly in PHP 7.4.X no longer functions as expected in PHP 8.2.6 because of the stricter type enforcement, leading to the observed error.

### 2.4 Why Wasn't This Prevented?

First, it's important to note that Telegraf functions without any issues even if the URLs are empty. Let's look at the relevant code in `telegraf/plugins/inputs/ping/ping.go`.

```go
func (p *Ping) Gather(acc telegraf.Accumulator) error {
	for _, host := range p.Urls {
		p.wg.Add(1)
		go func(host string) {
			defer p.wg.Done()

			switch p.Method {
			case "native":
				p.pingToURLNative(host, acc)
			default:
				p.pingToURL(host, acc)
			}
		}(host)
	}

	p.wg.Wait()

	return nil
}
```

In this code, the ping operation is attempted. Even if `p.Urls` is empty, no issues arise; the ping task simply doesn't execute. Since `p.wg.Add(1)` and `p.wg.Done()` aren't called, `p.wg.Wait()` is invoked immediately, avoiding any synchronization issues.

Currently, if you enable the "Enable Ping Monitor" option in pfSense's Telegraf settings and save without specifying any "Ping Host," you get a crash report like the following:

```
PHP Fatal error:  Uncaught TypeError: implode(): Argument #1 ($array) must be of type array, string given in /usr/local/pkg/telegraf.inc:132
Stack trace:
#0 /usr/local/pkg/telegraf.inc(132): implode()
#1 /usr/local/www/pkg_edit.PHP(245) : eval()'d code(1): telegraf_resync_config()
#2 /usr/local/www/pkg_edit.PHP(245): eval()
#3 {main}
  thrown in /usr/local/pkg/telegraf.inc on line 132
```

However, this crash report is generated by the PHP error described earlier and is not a result of pfSense's internal format validation upon saving the Telegraf settings via the GUI. This means that in pfSense CE 2.6, it would have saved without any crash reports.

The "Ping Host" input fields are displayed as follows:
![Ping Host Input](.././Ping_Host_input.png)

Here, "Ping Host 1" does not have an `(optional)` label. Even so, pfSense does not issue a warning if left blank and saved. Therefore, anyone who enabled the "Enable Ping Monitor" option and saved without specifying a "Ping Host" prior to version 2.7 would have encountered the same error after upgrading.

Various bug reports on this issue indicate that many users could not reproduce the problem. This is likely because they upgraded from pfSense 2.6 to 2.7 with the "Enable Ping Monitor" option disabled, preventing the issue from occurring.

## 3 How to Fix It?

### 3.1 Add an IP to Ping Host

As explained earlier, the issue arises because there are no IP addresses specified in `Ping Host`. Adding at

least one IP address to `Ping Host` will resolve the error. However, as noted in [1 Error](#1-error), the option to manage Telegraf settings via the GUI has disappeared. So, how can we modify the settings?

pfSense stores the configuration for all packages in `/conf/config.xml`. Opening this file, you'll find an entry for `<telegraf>` that includes `<ping_host_1></ping_host_1>`. You can add an IP address to this entry as follows:

```xml
<ping_host_1>db.server.ip.addr</ping_host_1>
```

Save the changes, and this should resolve the error by ensuring that at least one IP address is specified.

### 3.2 Disable Ping Monitor Option

In the code examined in [2.1 Code Causing the Error](#21-code-causing-the-error), there is a check `if ($telegraf_conf["ping_enable"]) {` that verifies whether the `ping_enable` option is turned on. If the Ping Monitor option is disabled, line 132, which causes the issue, will not be executed. This option is also present in `/conf/config.xml` as `<ping_enable>on</ping_enable>`. Removing the `on` value will disable the Ping Monitor option.

To disable it, modify the entry to:

```xml
<ping_enable></ping_enable>
```

This will turn off the Ping Monitor option and prevent the error from occurring. Save the changes, and the issue should be resolved.

### 3.3 Modify `telegraf.inc`

Initially, it seemed that modifying the `telegraf.inc` file to fix the root cause of the problem would be a viable solution. However, the `telegraf.inc` file is re-downloaded from the server whenever the package is reinstalled or pfSense is rebooted. This means any changes made to the file are not permanent. Additionally, there is no straightforward way to restart the package after modifying the `telegraf.inc` file. Nonetheless, addressing the issue at its core is essential.

Here is the modified code:

```PHP
/* Ping Monitor Configuration */
if ($telegraf_conf["ping_enable"]) {
    $monitor_hosts = array();
    if (!empty($telegraf_conf['ping_host_1'])) {
        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_1"] . '"';
    }
    if (!empty($telegraf_conf['ping_host_2'])) {
        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_2"] . '"';
    }
    if (!empty($telegraf_conf['ping_host_3'])) {
        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_3"] . '"';
    }
    if (!empty($telegraf_conf['ping_host_4'])) {
        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_4"] . '"';
    }

    if (!empty($monitor_hosts)) {
        $monitor_hosts = implode(",", $monitor_hosts); // line 132

        $cfg .= "\n[[inputs.ping]]\n";
        $cfg .= "\turls = [" . $monitor_hosts . "]";
        $cfg .= "\n\tdeadline = 0\n\n"; /* deadline (-w) function not supported in BSD ping */
    }
}
```

By initializing `$monitor_hosts` as an array and checking if it is empty before proceeding, the issue can be resolved.

Upon thinking of this solution and wanting to contribute to the package, I discovered the pfSense package repository. To my surprise, the issue was already [resolved](https://github.com/pfsense/FreeBSD-ports/blob/devel/net-mgmt/pfSense-pkg-Telegraf/files/usr/local/pkg/telegraf.inc) using this exact method. Additionally, it seems that this patch will be included in pfSense CE 2.8.0 and pfSense Plus 24.08, resolving the problem in future versions.

# Conclusion

This issue was reported immediately after the pfSense CE 2.7 update. However, no solution was widely known until recently, apart from this [document](https://redmine.pfSense.org/issues/14861), which did not provide a detailed resolution process. Hence, I decided to write this post. I hope this guide helps others who have been stressed by the same error to resolve it successfully.

Please note that there may be awkward expressions or inaccuracies in this post. All constructive feedback is welcome.

# References

-   [Telegraf inputs.ping](https://github.com/influxdata/telegraf/tree/master/plugins/inputs/ping)
-   [PHP implode](https://www.php.net/manual/en/function.implode.php)
-   [PHP Manual Backward Incompatible Changes](https://www.php.net/manual/en/migration80.incompatible.php)
-   [pfSense CE 2.7 Upgrade Notes](https://docs.netgate.com/pfSense/en/latest/releases/2-7-0.html)
-   [pfSense Issues](https://redmine.pfSense.org/issues/14861)
-   [issue fixed](https://github.com/pfsense/FreeBSD-ports/blob/devel/net-mgmt/pfSense-pkg-Telegraf/files/usr/local/pkg/telegraf.inc)
