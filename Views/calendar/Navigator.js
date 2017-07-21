import React from 'react';
import { Button, Styles, Text, View } from 'bappo-components';

const Navigator = ({
  onLeftPress,
  onMiddlePress,
  onRightPress,
}) => (
  <View style={styles.container}>
    <Button
      onPress={onLeftPress}
      style={styles.button}
    >
      <Text style={styles.chevron}>&lt;</Text>
    </Button>
    <Button
      onPress={onMiddlePress}
      style={[styles.button, styles.middleButton]}
    >
      <Text>Today</Text>
    </Button>
    <Button
      onPress={onRightPress}
      style={styles.button}
    >
      <Text style={styles.chevron}>&gt;</Text>
    </Button>
  </View>
);

export default Navigator;

const styles = {
  container: Styles.createViewStyle({
    flexDirection: 'row',
    alignItems: 'center',
  }),
  button: Styles.createButtonStyle({
    borderColor: '#000',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  }),
  middleButton: Styles.createButtonStyle({
    marginHorizontal: 4,
  }),
  chevron: Styles.createTextStyle({
  }),
};
