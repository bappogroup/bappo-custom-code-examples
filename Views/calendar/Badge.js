import React from 'react';
import { Styles, Text, View } from 'bappo-components';

const Badge = ({ number, color = '#000', highlighted = false }) => {
  return (
    <View style={[styles.container, highlighted && styles.highlight]}>
      <Text
        style={[
          styles.text,
          { color },
          highlighted && styles.highlightedText,
        ]}
      >
        {number}
      </Text>
    </View>
  );
};

export default Badge;

const styles = {
  container: Styles.createViewStyle({
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    width: 24,
    borderRadius: 12,
  }),
  highlight: Styles.createViewStyle({
    backgroundColor: 'red',
  }),
  text: Styles.createTextStyle({

  }),
  highlightedText: Styles.createTextStyle({
    color: '#fff',
  }),
};
