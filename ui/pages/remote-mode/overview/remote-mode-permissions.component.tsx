import React from 'react';

import { Box, Text } from '../../../components/component-library';
import Card from '../../../components/ui/card';
import {
  FontWeight,
  TextVariant,
  Display,
  JustifyContent,
  TextColor,
  BackgroundColor,
} from '../../../helpers/constants/design-system';

export default function RemoteModePermissions({
  setStartEnableRemoteSwap,
  setStartEnableDailyAllowance,
}: {
  setStartEnableRemoteSwap?: (startEnableRemoteSwap: boolean) => void;
  setStartEnableDailyAllowance?: (startEnableDailyAllowance: boolean) => void;
}) {
  const handleEnableRemoteSwap = () => {
    if (setStartEnableRemoteSwap) {
      setStartEnableRemoteSwap(true);
    }
  };

  const handleEnableDailyAllowance = () => {
    if (setStartEnableDailyAllowance) {
      setStartEnableDailyAllowance(true);
    }
  };

  return (
    <Box>
      <Text variant={TextVariant.headingSm} fontWeight={FontWeight.Bold}>
        Permissions
      </Text>
      <Text variant={TextVariant.bodyMd} color={TextColor.textAlternativeSoft}>
        Safely access your hardware wallet funds without plugging it in. Revoke
        permissions anytime.
      </Text>
      <Box paddingTop={2} paddingBottom={2}>
        <Card backgroundColor={BackgroundColor.backgroundMuted}>
          <Box
            display={Display.Flex}
            gap={2}
            justifyContent={JustifyContent.spaceBetween}
            paddingTop={2}
            paddingBottom={2}
          >
            <Text>Swap</Text>
            <Text
              color={TextColor.infoDefault}
              style={{ cursor: 'pointer' }}
              onClick={handleEnableRemoteSwap}
            >
              Enable
            </Text>
          </Box>
          <Text color={TextColor.textAlternativeSoft}>
            Allow your MetaMask account to trade with hardware funds via
            MetaMask Swaps. Allowances can only be used to swap.
          </Text>
        </Card>
      </Box>
      <Box paddingTop={2} paddingBottom={2}>
        <Card backgroundColor={BackgroundColor.backgroundMuted}>
          <Box
            display={Display.Flex}
            gap={2}
            justifyContent={JustifyContent.spaceBetween}
            paddingTop={2}
            paddingBottom={2}
          >
            <Text>Daily allowances</Text>
            <Text
              color={TextColor.infoDefault}
              onClick={handleEnableDailyAllowance}
            >
              Enable
            </Text>
          </Box>
          <Text color={TextColor.textAlternativeSoft}>
            Allow your MetaMask account to withdraw from hardware funds up to
            the daily limit.
          </Text>
        </Card>
      </Box>
    </Box>
  );
}
