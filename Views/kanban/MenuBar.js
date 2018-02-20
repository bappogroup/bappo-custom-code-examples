import React from 'react';
import { styled, Button, Text, View } from 'bappo-components';

const MenuBar = ({
  detailsDisabled,
  editDisabled,
  openNewIssueForm,
  openEditIssueForm,
  openIssueDetailsPage,
  openWorkflowPopup,
}) => {
  return (
    <Container>
      <MenuButtonContainer>
        <MenuButton onPress={openNewIssueForm}>
          <MenuButtonText>Add</MenuButtonText>
        </MenuButton>
      </MenuButtonContainer>
      <MenuButtonContainer disabled={detailsDisabled}>
        <MenuButton disabled={detailsDisabled} onPress={openIssueDetailsPage}>
          <MenuButtonText>Details</MenuButtonText>
        </MenuButton>
      </MenuButtonContainer>
      <MenuButtonContainer disabled={editDisabled}>
        <MenuButton disabled={editDisabled} onPress={openEditIssueForm}>
          <MenuButtonText>Edit</MenuButtonText>
        </MenuButton>
      </MenuButtonContainer>
      <MenuButtonContainer disabled={editDisabled}>
        <MenuButton disabled={editDisabled} onPress={openWorkflowPopup}>
          <MenuButtonText>Workflow</MenuButtonText>
        </MenuButton>
      </MenuButtonContainer>
    </Container>
  );
};

export default MenuBar;

const Container = styled(View)`
  align-items: center;
  background-color: #425f75;
  flex-direction: row;
  height: 40px;
  overflow: visible;
  padding: 4.5px;
`;

const MenuButtonContainer = styled(View)`
  opacity: ${({ disabled }) => (disabled ? '0.5' : '1')};
`;

const MenuButton = styled(Button)`
  align-items: center;
  background-color: #edf1f2;
  justify-content: center;
  margin-left: 5px;
  padding-top: 6px;
  padding-bottom: 6px;
  padding-left: 15px;
  padding-right: 15px;
`;

const MenuButtonText = styled(Text)`
  font-size: 13.5px;
`;
