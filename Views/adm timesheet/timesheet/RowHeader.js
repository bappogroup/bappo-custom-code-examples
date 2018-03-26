import React from 'react';
import moment from 'moment';
import { styled, View, Text } from 'bappo-components';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const RowHeader = ({ week }) => {
  const cells = weekdays.map((v, i) => (
    <Cell key={v}>
      {`${v} ${moment(week.startDate)
        .add(i + 1, 'day')
        .format('DD/MM')}`}
    </Cell>
  ));

  return (
    <RowContainer>
      <Cell>Task</Cell>
      {cells}
      <Cell>Total</Cell>
      <Divider />
    </RowContainer>
  );
};

export default RowHeader;

const RowContainer = styled(View)`
  flex-direction: row;
  margin-top: 10px;
  margin-bottom: 20px;
`;

const Cell = styled(Text)`
  font-weight: bold;
  flex: 1;
  display: flex;
  justify-content: center;
`;

const Divider = styled(View)`
  position: absolute;
  bottom: -7px;
  width: 100%;
  height: 1px;
  background-color: #ccc;
`;
