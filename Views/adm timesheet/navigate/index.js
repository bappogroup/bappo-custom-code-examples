import React from 'react';
import { styled, ActivityIndicator, View, Text } from 'bappo-components';
import { findOrCreateTimesheetByDate } from 'utils';

class Navigator extends React.Component {
  state = {
    errorMessage: null,
  };

  async componentWillMount() {
    const { $navigation, $global, $models } = this.props;
    const { currentUser } = $global;

    // TODO: Navigate Manager users
    const currentEmployee = await $models.Employee.findOne({
      where: {
        user_id: currentUser.id,
      },
    });

    if (!currentEmployee) {
      return this.setState({
        errorMessage: 'You are not authorized to Timesheets',
      });
    }

    // Find current week's timesheet
    // In ADM, weeks start on Sundays and end on Saturdays
    const targetTimesheet = await findOrCreateTimesheetByDate(
      $models,
      currentEmployee.id,
    );

    // Navigate to this timesheet
    return $navigation.navigate('MyTimesheetView', {
      recordId: targetTimesheet.id,
    });
  }

  render() {
    const { errorMessage } = this.state;

    return (
      <Container>
        {errorMessage ? (
          <Message>{errorMessage}</Message>
        ) : (
          <ActivityIndicator />
        )}
      </Container>
    );
  }
}

export default Navigator;

const Container = styled(View)`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const Message = styled(Text)`
  font-size: 20px;
`;
