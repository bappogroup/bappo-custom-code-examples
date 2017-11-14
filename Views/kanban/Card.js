import React from 'react';
import { styled, Button, Text, View } from 'bappo-components';
import Avatar from './Avatar';

class Card extends React.PureComponent {
  render() {
    const { issue, onPress, selected } = this.props;

    return (
      <Container
        onPress={onPress}
        selected={selected}
      >
        <Header>
          <IssueNumberText>{issue.refNo}</IssueNumberText>
          <TitleText>{issue.name}</TitleText>
        </Header>
        <Footer>
          {issue.assignedTo && (
            <Avatar
              user={issue.assignedTo}
            />
          )}
        </Footer>
      </Container>
    );
  }
}

export default Card;

const Container = styled(Button)`
  border: 1px solid #ddd;
  flex: none;
  height: 109px;
  margin-top: 10px;
  padding: 7px;
  width: 200px;

  ${({ selected }) => selected && `
    background-color: #c5e597;
  `};
`;

const Header = styled(View)`
  height: 48px;
  margin-bottom: 10px;
`;

const IssueNumberText = styled(Text)`
  color: #607a8a;
  font-size: 12px;
  height: 18px;
`;

const TitleText = styled(Text)`
  font-size: 13px;
  height: 30px;
`;

const Footer = styled(View)`
  flex-direction: row;
  justify-content: flex-end;
  margin-top: 10px;
`;
