import React from 'react';
import { styled } from 'bappo-components';

class Report extends React.Component {
  state = {};

  renderRow = ([key, value]) => (
    <Row>
      <RowLabel>{key}</RowLabel>
      <Cell>{value}</Cell>
    </Row>
  );

  render() {
    const { name, time, data } = this.props;
    let total = 0;
    Object.values(data).forEach(value => {
      total += +value;
    });

    return (
      <Container>
        <Title>
          {name} Report, {time}
        </Title>
        {Object.entries(data).map(this.renderRow)}
        <Row style={{ borderTop: '1px solid black' }}>
          <RowLabel>Total</RowLabel>
          <Cell>{total}</Cell>
        </Row>
      </Container>
    );
  }
}

export default Report;

const Container = styled.div`
  margin-top: 50px;
`;

const Title = styled.div`
  font-size: 18px;
  margin-left: 30px;
  margin-bottom: 30px;
`;

const Row = styled.div`
  padding-right: 30px;
  padding-left: 30px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  border-top: 1px solid #eee;
  line-height: 30px;
`;

const RowLabel = styled.div`
  flex: none;
  width: 240px;
`;

const Cell = styled.div`
  flex: 1;
`;
