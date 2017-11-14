import React from 'react';
import { styled, Text, View } from 'bappo-components';

const getInitials = ({ firstName, lastName, email }) => {
  const firstNameLetter = firstName && firstName.charAt(0).toUpperCase();
  const lastNameLetter = lastName && lastName.charAt(0).toUpperCase();
  const emailLetter = email && email.charAt(0).toUpperCase();

  if (firstName && lastName) {
    return `${firstNameLetter}${lastNameLetter}`;
  } else if (firstName) {
    return firstNameLetter;
  } else if (lastName) {
    return lastNameLetter;
  }
  return emailLetter;
};

const Avatar = ({ user }) => {
  return (
    <Container
      color={user.avatarColour}
    >
      <InitialText>{getInitials(user)}</InitialText>
    </Container>
  );
};

export default Avatar;

const Container = styled(View)`
  align-items: center;
  background-color: ${({ color }) => color};
  height: 24px;
  justify-content: center;
  width: 24px;
`;

const InitialText = styled(Text)`
  color: white;
  font-size: 12px;
`;
