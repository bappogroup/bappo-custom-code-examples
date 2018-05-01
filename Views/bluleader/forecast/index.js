import React from 'react';
import { styled } from 'bappo-components';
import ForecastReport from 'forecast-report';
import {
  calculateForecastForProfitCentre,
  calculateForecastForCompany,
  calculateBaseData,
  getForecastEntryKey,
  generateMonthArray,
} from 'utils';

class ForecastMatrix extends React.Component {
  monthArray = [];

  state = {
    loading: false,
    entries: {},
    blur: false,
    reportParams: null,
    calculationBaseData: null,
    cos_elements: [],
    rev_elements: [],
    oh_elements: [],
  };

  componentDidMount() {
    this.monthArray = generateMonthArray();
    this.loadData();
  }

  async componentDidUpdate(prevProps) {
    if (
      prevProps.financialYear !== this.props.financialYear ||
      prevProps.profitCentreIds !== this.props.profitCentreIds
    ) {
      this.loadData();
    }
  }

  loadData = async () => {
    const { $models, financialYear, profitCentreIds } = this.props;
    if (!(financialYear && profitCentreIds && profitCentreIds.length)) return;

    this.setState({ loading: true });

    // Find all related entries
    const entriesArray = await $models.ForecastEntry.findAll({
      include: [{ as: 'profitCentre' }, { as: 'costCentre' }, { as: 'forecastElement' }],
      limit: 100000,
      where: {
        financialYear,
        profitCentre_id: {
          $in: profitCentreIds,
        },
      },
    });

    const elements = await $models.ForecastElement.findAll({});
    const cos_elements = [];
    const rev_elements = [];
    const oh_elements = [];

    const entries = {};
    for (const entry of entriesArray) {
      const key = getForecastEntryKey(
        entry.financialYear,
        entry.financialMonth,
        entry.forecastElement_id,
        true,
      );

      if (!entries[key]) {
        entries[key] = {
          amount: +entry.amount,
          financialMonth: entry.financialMonth,
          financialYear: entry.financialYear,
          forecastElement: entry.forecastElement,
          forecastElement_id: entry.forecastElement_id,
          id: entry.id,
        };
      } else {
        entries[key].amount += +entry.amount;
      }
    }

    for (const element of elements) {
      switch (element.elementType) {
        case '1':
          cos_elements.push(element);
          break;
        case '2':
          rev_elements.push(element);
          break;
        case '3':
          oh_elements.push(element);
          break;
        default:
      }
    }

    await this.setState({
      loading: false,
      entries,
      cos_elements,
      rev_elements,
      oh_elements,
      totals: this.calcTotals(entries),
    });
  };

  // Only for single profit centre forecast
  handleCellChange = (financialMonth, forecastElement, amount) => {
    const { financialYear } = this.props;
    const key = getForecastEntryKey(financialYear, financialMonth, forecastElement.id, true);

    this.setState(({ entries, ...others }) => {
      const updatedEntries = { ...entries };
      if (!updatedEntries[key]) {
        updatedEntries[key] = {
          amount: 0,
          financialMonth,
          financialYear,
          forecastElement,
          forecastElement_id: forecastElement.id,
        };
      }
      updatedEntries[key].amount = +amount;
      return {
        ...others,
        entries: updatedEntries,
        totals: this.calcTotals(updatedEntries),
      };
    });
  };

  // Only for single profit centre forecast
  save = async () => {
    const { $models, financialYear, profitCentreIds, mode } = this.props;

    if (mode !== 'profitCentre') return;

    this.setState({ blur: true });
    const { entries } = this.state;

    const profitCentre_id = profitCentreIds[0];
    await $models.ForecastEntry.destroy({
      where: {
        financialYear,
        profitCentre_id,
      },
    });

    const entriesToCreate = Object.values(entries).map(e => ({
      financialYear: e.financialYear,
      financialMonth: e.financialMonth,
      forecastElement_id: e.forecastElement_id,
      amount: +e.amount,
      costCentre_id: e.costCentre_id,
      profitCentre_id,
    }));
    await $models.ForecastEntry.bulkCreate(entriesToCreate);
    this.setState({ blur: false });
  };

  // Calculate all rows that need to. Then update db, reload data and calculate total
  calculate = async () => {
    this.setState({ blur: true, reportParams: null });
    const { $models, profitCentreIds, financialYear, mode } = this.props;

    if (!profitCentreIds.length) return;

    // Get general data in preparation for calculations
    const calculationBaseData = await calculateBaseData({
      $models,
      profitCentreIds,
    });

    switch (mode) {
      case 'profitCentre': {
        await calculateForecastForProfitCentre({
          ...calculationBaseData,
          $models,
          financialYear,
          profitCentre_id: profitCentreIds[0],
        });
        break;
      }
      case 'company': {
        await calculateForecastForCompany({
          ...calculationBaseData,
          $models,
          financialYear,
          profitCentreIds,
        });
        break;
      }
      default:
    }

    await this.loadData();

    await this.setState(state => ({
      calculationBaseData, // Cache base data for future calculations
      totals: this.calcTotals(state.entries),
      blur: false,
    }));
  };

  calcTotals = entries => {
    const tot = this.getZeroTotals();

    for (const key of Object.keys(entries)) {
      const entry = entries[key];
      if (entry && entry.forecastElement) {
        const amt = Number(entry.amount);
        if (amt !== 0) {
          switch (entry.forecastElement.elementType) {
            case '1':
              tot.cos[entry.financialMonth] += amt;
              tot.gp[entry.financialMonth] += -amt;
              tot.np[entry.financialMonth] += -amt;
              break;
            case '2':
              tot.rev[entry.financialMonth] += amt;
              tot.gp[entry.financialMonth] += amt;
              tot.np[entry.financialMonth] += amt;
              break;
            case '3':
              tot.oh[entry.financialMonth] += amt;
              tot.np[entry.financialMonth] += -amt;
              break;
            default:
            // do nothing
          }
        }
      }
    }
    return tot;
  };

  getZeroTotals = () => {
    const t = {
      cos: {},
      rev: {},
      oh: {},
      gp: {},
      np: {},
    };

    this.monthArray.forEach(({ financialMonth }) => {
      t.cos[financialMonth] = 0;
      t.rev[financialMonth] = 0;
      t.oh[financialMonth] = 0;
      t.gp[financialMonth] = 0;
      t.np[financialMonth] = 0;
    });

    return t;
  };

  setReportParams = async (financialMonth, elementKey, showTables) => {
    if (!this.state.calculationBaseData) await this.calculate();

    const { financialYear } = this.props;

    this.setState({
      reportParams: {
        showTables,
        elementKey,
        financialYear,
        financialMonth,
      },
    });
  };

  renderRow = element => {
    let displayOnly = false;
    if (this.props.mode === 'company') displayOnly = true;
    else {
      switch (element.key) {
        case 'SAL':
        case 'TMREV':
        case 'FIXREV':
        case 'CWAGES':
        case 'INTCH':
        case 'INTREV':
          displayOnly = true;
          break;
        default:
      }
    }

    return (
      <Row>
        {this.monthArray.map(month => this.renderCell(month.financialMonth, element, displayOnly))}
      </Row>
    );
  };

  renderCell = (financialMonth, element, displayOnly = false) => {
    const key = getForecastEntryKey(this.props.financialYear, financialMonth, element.id, true);
    const entry = this.state.entries[key];
    const value = entry && entry.amount;

    if (displayOnly) {
      return (
        <ClickableCell
          onClick={() => {
            if (value) this.setReportParams(financialMonth, element.key);
          }}
        >
          {value}
        </ClickableCell>
      );
    }

    return (
      <Cell>
        <Input
          value={value}
          onChange={event => this.handleCellChange(financialMonth, element, event.target.value)}
        />
      </Cell>
    );
  };

  renderTotal = (month, key) => <BoldCell>{this.state.totals[key][month]}</BoldCell>;

  renderTotals = key => (
    <Row>{this.monthArray.map(month => this.renderTotal(month.financialMonth, key))}</Row>
  );

  renderLabelColumn = () => {
    const renderElementLabel = ({ name }) => <RowLabel>{name}</RowLabel>;
    return (
      <LabelColumnContainer>
        <RowLabel />
        {this.state.rev_elements.map(renderElementLabel)}
        <RowLabel>Total Revenue</RowLabel>
        <Space />
        {this.state.cos_elements.map(renderElementLabel)}
        <RowLabel>Total Cost of Sales</RowLabel>

        <Space />
        <RowLabel>Gross Profit</RowLabel>

        <Space />
        {this.state.oh_elements.map(renderElementLabel)}
        <RowLabel>Total Overheads</RowLabel>

        <Space />
        <RowLabel>Net Profit</RowLabel>
      </LabelColumnContainer>
    );
  };

  render() {
    const { loading, blur, reportParams, calculationBaseData } = this.state;
    const { title, profitCentreIds, financialYear, setFilters } = this.props;

    if (!(profitCentreIds && profitCentreIds.length && financialYear)) {
      return (
        <Loading>
          Please set filters to continue.
          <TextButton onClick={setFilters}>set</TextButton>
        </Loading>
      );
    }
    if (loading) {
      return <Loading>Loading...</Loading>;
    }

    return (
      <Container blur={blur}>
        <HeaderContainer>
          <Heading>
            {title}, financial year {financialYear}
          </Heading>
          <TextButton onClick={setFilters}>change</TextButton>
          <TextButton onClick={this.calculate}>calculate</TextButton>
        </HeaderContainer>

        <TableContainer>
          {this.renderLabelColumn()}
          <DataRowsContainer>
            <HeaderRow>
              {this.monthArray.map(({ label, financialMonth }) => (
                <ClickableCell
                  style={{ border: 'none' }}
                  onClick={() =>
                    this.setReportParams(financialMonth, null, ['consultant', 'project'])
                  }
                >
                  {label === 'Jan' && <YearLabel>{+financialYear + 1}</YearLabel>}
                  <HeaderLabel>{label}</HeaderLabel>{' '}
                </ClickableCell>
              ))}
            </HeaderRow>
            {this.state.rev_elements.map(this.renderRow)}
            {this.renderTotals('rev')}
            <Space />
            {this.state.cos_elements.map(this.renderRow)}
            {this.renderTotals('cos')}

            <Space />
            {this.renderTotals('gp')}

            <Space />
            {this.state.oh_elements.map(this.renderRow)}
            {this.renderTotals('oh')}

            <Space />
            {this.renderTotals('np')}
          </DataRowsContainer>
        </TableContainer>

        <SaveButton onClick={this.save}>Save</SaveButton>

        <ForecastReport
          $models={this.props.$models}
          profitCentreIds={profitCentreIds}
          {...reportParams}
          {...calculationBaseData}
        />
      </Container>
    );
  }
}

export default ForecastMatrix;

const Input = styled.input`
  flex: 1;
  width: 0px;
  border: none;
  text-align: center;
  padding-right: 5px;
  font-size: 11pt;
  border-bottom: 1px solid white;
  &:focus {
    outline: none;
    border-bottom: 1px solid gray;
  }
`;

const Container = styled.div`
  margin-top: 50px;
  overflow-y: scroll;
  ${props => (props.blur ? 'filter: blur(3px); opacity: 0.5;' : '')};
`;

const TableContainer = styled.div`
  display: flex;
`;

const LabelColumnContainer = styled.div`
  flex: none;
  width: 180px;
  padding-left: 30px;
`;

const DataRowsContainer = styled.div`
  flex: 1;
  overflow-x: scroll;
`;

const HeaderLabel = styled.div`
  text-align: center;
  flex: 1;
`;

const Space = styled.div`
  height: 50px;
`;

const Loading = styled.div`
  color: #ddd;
  margin-top: 50px;
  display: flex;
  justify-content: center;
`;

const HeaderContainer = styled.div`
  margin: 30px;
  margin-top: 0;
  display: flex;
`;

const TextButton = styled.span`
  font-size: 13px;
  color: grey;
  margin-left: 20px;
  margin-top: 3px;

  &:hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

const Heading = styled.div`
  font-size: 18px;
`;

const YearLabel = styled.div`
  position: absolute;
  bottom: 19px;
  font-weight: lighter;
  font-size: 12px;
`;

const Row = styled.div`
  padding-right: 30px;
  padding-left: 30px;
  display: flex;
  flex-direction: row;
  height: 30px;
`;

const HeaderRow = styled(Row)`
  border: none;
  color: gray;
  font-weight: bold;
`;

const RowLabel = styled.div`
  height: 30px;
  display: flex;
  align-items: center;
`;

const Cell = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 120px;
  border-top: 1px solid #eee;
`;

const ClickableCell = styled(Cell)`
  &: hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

const BoldCell = styled(Cell)`
  font-weight: bold;
  border-top: 1px solid black;
  border-bottom: 1px solid black;
`;

const SaveButton = styled.div`
  color: white;
  border-radius: 3px;
  background-color: orange;
  height: 40px;
  padding: 0px 40px;
  cursor: pointer;
  float: right;
  margin: 20px 30px;
  display: flex;
  align-items: center;
  &:hover {
    opacity: 0.7;
  }
`;
