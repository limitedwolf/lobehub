import { type DeviceAttachment } from '@lobechat/builtin-tool-remote-device';
import { Flexbox, Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { LaptopIcon, MonitorIcon, ServerIcon } from 'lucide-react';
import { memo } from 'react';

const styles = createStaticStyles(({ css }) => ({
  deviceName: css`
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
  deviceOption: css`
    cursor: pointer;

    width: 100%;
    padding-block: 8px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    transition: background-color 0.2s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  deviceOptionActive: css`
    background: ${cssVar.colorFillTertiary};
  `,
  deviceOptionDesc: css`
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
  `,
  deviceOptionIcon: css`
    flex-shrink: 0;
    border: 1px solid ${cssVar.colorFillTertiary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorBgElevated};
  `,
  sectionTitle: css`
    padding-block: 6px 2px;
    padding-inline: 8px;

    font-size: 11px;
    font-weight: 500;
    color: ${cssVar.colorTextQuaternary};
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `,
}));

const PLATFORM_ICONS: Record<string, typeof LaptopIcon> = {
  darwin: LaptopIcon,
  linux: MonitorIcon,
  win32: MonitorIcon,
};

interface DeviceSelectorProps {
  activeDeviceId?: string;
  devices: DeviceAttachment[];
  onSelect: (deviceId: string) => void;
}

export const DeviceSelector = memo<DeviceSelectorProps>(
  ({ activeDeviceId, devices, onSelect }) => {
    return (
      <>
        {devices.map((device) => {
          const IconComp = PLATFORM_ICONS[device.platform] || ServerIcon;
          const isActive = activeDeviceId === device.deviceId;

          return (
            <Flexbox
              horizontal
              align={'flex-start'}
              className={cx(styles.deviceOption, isActive && styles.deviceOptionActive)}
              gap={12}
              key={device.deviceId}
              onClick={() => onSelect(device.deviceId)}
            >
              <Flexbox
                align={'center'}
                className={styles.deviceOptionIcon}
                height={32}
                justify={'center'}
                width={32}
              >
                <Icon icon={IconComp} size={16} />
              </Flexbox>
              <Flexbox flex={1}>
                <div className={styles.deviceName}>{device.hostname}</div>
                <div className={styles.deviceOptionDesc}>{device.platform}</div>
              </Flexbox>
            </Flexbox>
          );
        })}
      </>
    );
  },
);

DeviceSelector.displayName = 'DeviceSelector';

/** Section header for device/sandbox/none groups */
export const SectionHeader = memo<{ label: string }>(({ label }) => (
  <div className={styles.sectionTitle}>{label}</div>
));

SectionHeader.displayName = 'SectionHeader';
