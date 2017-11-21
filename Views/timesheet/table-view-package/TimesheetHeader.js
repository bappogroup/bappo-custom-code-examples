import React from 'react';
import { styled, View, Text, Button } from 'bappo-components';

const TimesheetHeader = ({
  timesheet,
  switchWeek,
}) => {
  if (!timesheet) return null;

  return (
    <Container>
      <Title>
        {`${timesheet.consultant.name}'s Timesheet`}
      </Title>
      <SwitchButton onPress={() => switchWeek(false)}>
        <ButtonText>{'<'}</ButtonText>
      </SwitchButton>
      <SwitchButton onPress={() => switchWeek(true)}>
        <ButtonText>{'>'}</ButtonText>
      </SwitchButton>
    </Container>
  );
};

export default TimesheetHeader;

const Container = styled(View)`
  margin: 15px;
  flex-direction: row;
`;

const Title = styled(Text)`
  font-size: 20px;
  margin-right: 25px;
`;

const SwitchButton = styled(Button)`
  margin-left: 7px;
  margin-right: 7px;
`;

const ButtonText = styled(Text)`
  font-size: 20px;
  color: grey;
`;
