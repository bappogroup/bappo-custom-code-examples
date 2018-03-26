import React from 'react';
import { styled, View, Text, Button, DatePicker } from 'bappo-components';

const TimesheetHeader = ({ timesheet, changeWeek }) => {
  if (!timesheet) return null;

  return (
    <Container>
      <Title>{`${timesheet.employee.name}'s Timesheet`}</Title>
      <SwitchButton onPress={() => changeWeek(-1)}>
        <ButtonText>{'<'}</ButtonText>
      </SwitchButton>
      <SwitchButton onPress={() => changeWeek(1)}>
        <ButtonText>{'>'}</ButtonText>
      </SwitchButton>
      <StyledDatePicker
        placeholder="Jump"
        onValueChange={date => changeWeek(null, date)}
        clearable={false}
      />
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

const StyledDatePicker = styled(DatePicker)`
  margin-left: 15px;
`;
