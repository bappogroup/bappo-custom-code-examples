import React from 'react';
import { styled } from 'bappo-components';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import ForecastReport from 'forecast-report';
import {
  calculateForecastForProfitCentre,
  calculateBaseData,
  getForecastEntryKey,
  getFinancialTimeFromDate,
  generateMonthArray,
} from 'utils';

const newEntry = (financialYear, financialMonth, element, amount) => ({
  financialYear,
  financialMonth,
  forecastElement_id: element.id,
  forecastElement: element,
  amount: amount || '',
});

class ForecastMatrix extends React.Component {
  monthArray = [];

  state = {
    loading: true,
    financialYear: null,
    profitCentre: null,
    entries: {},
    blur: false,
    reportParams: null,
    calculationBaseData: null,
    cos_elements: [],
    rev_elements: [],
    oh_elements: [],
  };

  async componentDidMount() {
    this.monthArray = generateMonthArray();

    // Load user preferences
    const prefs = await getUserPreferences(this.props.$global.currentUser.id, this.props.$models);
    const { profitcentre_id, financialYear } = prefs;

    if (!(profitcentre_id && financialYear)) await this.setFilters();
    else {
      const profitCentre = await this.props.$models.ProfitCentre.findById(profitcentre_id);
      await this.setState({
        profitCentre,
        financialYear,
      });
      await this.calculate();
    }
  }

  // Bring up a popup asking which profit centre and time slot
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { profitCentre, financialYear } = this.state;

    const profitCentres = await $models.ProfitCentre.findAll({
      limit: 1000,
    });

    const profitCentreOptions = profitCentres.map(pc => ({
      id: pc.id,
      label: pc.name,
    }));

    $popup.form({
      fields: [
        {
          name: 'profitCentreId',
          label: 'Profit Centre',
          type: 'FixedList',
          properties: {
            options: profitCentreOptions,
          },
          validate: [value => (value ? undefined : 'Required')],
        },
        {
          name: 'financialYear',
          label: 'Financial Year',
          type: 'Year',
          validate: [value => (value ? undefined : 'Required')],
        },
      ],
      initialValues: {
        profitCentreId: profitCentre && profitCentre.id,
        financialYear: financialYear || getFinancialTimeFromDate().financialYear,
      },
      onSubmit: async ({ profitCentreId, financialYear }) => {
        const profitCentre = profitCentres.find(pc => pc.id === profitCentreId);
        await this.setState({
          calculationBaseData: null,
          reportParams: null,
          profitCentre,
          financialYear,
        });
        await this.calculate();
        setUserPreferences(this.props.$global.currentUser.id, $models, {
          profitcentre_id: profitCentreId,
          financialYear,
        });
      },
    });
  };

  loadData = async () => {
    const { financialYear, profitCentre } = this.state;
    if (!(financialYear && profitCentre)) return;

    const { ForecastEntry, ForecastElement } = this.props.$models;

    // Find all related entries
    const entriesArray = await ForecastEntry.findAll({
      include: [{ as: 'profitCentre' }, { as: 'costCentre' }, { as: 'forecastElement' }],
      limit: 100000,
      where: {
        active: true,
        financialYear,
        profitCentre_id: profitCentre.id,
      },
    });

    const elements = await ForecastElement.findAll({});
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
      entries[key] = entry;
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

      // Create new entries for empty cells
      this.monthArray.forEach(month => {
        const key = getForecastEntryKey(financialYear, month.financialMonth, element.id, true);
        entries[key] = entries[key] || newEntry(financialYear, month.financialMonth, element);
      });
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

  handleCellChange = (entry, amt) => {
    const key = getForecastEntryKey(
      entry.financialYear,
      entry.financialMonth,
      entry.forecastElement_id,
      true,
    );
    const revisedEntry = {};
    const sign = amt.includes('-') ? '-' : '';
    const amount = sign + amt.replace(/[^0-9.]+/g, '').replace(/^0+/g, '');
    revisedEntry[key] = { ...this.state.entries[key], amount, changed: true };
    const entries = { ...this.state.entries, ...revisedEntry };
    this.setState({
      entries,
      totals: this.calcTotals(entries),
    });
  };

  save = async () => {
    this.setState({ blur: true });
    const { ForecastEntry } = this.props.$models;
    const { financialYear, profitCentre, entries } = this.state;

    await ForecastEntry.destroy({
      where: {
        financialYear,
        profitCentre_id: profitCentre.id,
      },
    });

    const entriesToCreate = Object.values(entries).map(e => ({
      financialYear: e.financialYear,
      financialMonth: e.financialMonth,
      forecastElement_id: e.forecastElement_id,
      amount: +e.amount,
      costCentre_id: e.costCentre_id,
      profitCentre_id: profitCentre.id,
    }));
    await ForecastEntry.bulkCreate(entriesToCreate);
    this.setState({ blur: false });
  };

  // Calculate all rows that need to. Then update db, reload data and calculate total
  calculate = async () => {
    this.setState({ blur: true, reportParams: null });
    const { profitCentre, financialYear } = this.state;

    // Get general data in preparation for calculations
    const calculationBaseData = await calculateBaseData({
      $models: this.props.$models,
      profitCentreIds: [profitCentre.id],
    });

    await calculateForecastForProfitCentre({
      ...calculationBaseData,
      $models: this.props.$models,
      financialYear,
      profitCentre_id: profitCentre.id,
    });

    await this.loadData();

    await this.setState(state => ({
      calculationBaseData,
      totals: this.calcTotals(state.entries),
      blur: false,
    }));
  };

  calcTotals = entries => {
    const tot = this.getZeroTotals();

    for (const key of Object.keys(entries)) {
      const entry = entries[key];
      if (entry.forecastElement) {
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

  renderRow = element => {
    let displayOnly = false;
    switch (element.key) {
      case 'SAL':
      case 'TMREV':
      case 'CWAGES':
      case 'INTCH':
      case 'INTREV':
        displayOnly = true;
        break;
      default:
    }

    return (
      <Row>
        <RowLabel>
          <span>{element.name}</span>
        </RowLabel>
        {this.monthArray.map(month => this.renderCell(month.financialMonth, element, displayOnly))}
      </Row>
    );
  };

  renderCell = (financialMonth, element, displayOnly = false) => {
    const key = getForecastEntryKey(this.state.financialYear, financialMonth, element.id, true);
    const entry = this.state.entries[key];
    const value = entry && entry.amount;

    if (displayOnly) {
      return (
        <ClickableCell
          onClick={() => {
            if (value) this.calculateReportData(financialMonth, element.key);
          }}
        >
          {value}
        </ClickableCell>
      );
    }

    return (
      <Cell>
        <Input value={value} onChange={event => this.handleCellChange(entry, event.target.value)} />
      </Cell>
    );
  };

  calculateReportData = async (financialMonth, elementKey) => {
    const { profitCentre, financialYear } = this.state;
    if (!(profitCentre && financialYear)) return;

    this.setState({
      reportParams: {
        elementKey,
        financialYear,
        financialMonth,
      },
    });
  };

  renderTotal = (month, key) => <TotalCell>{this.state.totals[key][month]}</TotalCell>;

  renderTotals = (key, label) => (
    <RowSubTotal>
      <RowLabel style={{ fontWeight: 'bold' }}> {label} </RowLabel>
      {this.monthArray.map(month => this.renderTotal(month.financialMonth, key))}
    </RowSubTotal>
  );

  render() {
    const {
      loading,
      blur,
      profitCentre,
      financialYear,
      reportParams,
      calculationBaseData,
    } = this.state;

    if (!(profitCentre && financialYear)) {
      return (
        <Loading>
          Please specify a profit centre and financial year to continue.
          <TextButton onClick={this.setFilters}>change</TextButton>
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
            Profit centre: {profitCentre.name}, financial year {financialYear}
          </Heading>
          <TextButton onClick={this.setFilters}>change</TextButton>
          <TextButton onClick={this.calculate}>calculate</TextButton>
        </HeaderContainer>
        <HeaderRow>
          <RowLabel />
          {this.monthArray.map(({ label, financialMonth }) => (
            <ClickableCell onClick={() => this.calculateReportData(financialMonth)}>
              {label === 'Jan' && <YearLabel>{+financialYear + 1}</YearLabel>}
              <HeaderLabel>{label}</HeaderLabel>{' '}
            </ClickableCell>
          ))}
        </HeaderRow>
        {this.state.rev_elements.map(this.renderRow)}
        {this.renderTotals('rev', 'Total Revenue')}
        <Space />
        {this.state.cos_elements.map(this.renderRow)}
        {this.renderTotals('cos', 'Total Cost of Sales')}

        <Space />
        {this.renderTotals('gp', 'Gross Profit')}

        <Space />
        {this.state.oh_elements.map(this.renderRow)}
        {this.renderTotals('oh', 'Total Overheads')}

        <Space />
        {this.renderTotals('np', 'Net Profit')}

        <SaveButton onClick={this.save}>Save</SaveButton>

        <ForecastReport
          $models={this.props.$models}
          profitCentreIds={[profitCentre.id]}
          {...reportParams}
          {...calculationBaseData}
        />
      </Container>
    );
  }
}

export default ForecastMatrix;

const Row = styled.div`
  padding-right: 30px;
  padding-left: 30px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  border-top: 1px solid #eee;
  line-height: 30px;
`;

const RowSubTotal = styled(Row)`
  border-top: 1px solid black;
  border-bottom: 1px solid black;
`;

const HeaderRow = styled(Row)`
  border: none;
  color: gray;
  font-weight: bold;
`;

const RowLabel = styled.div`
  flex: none;
  width: 240px;
`;

const Cell = styled.div`
  position: relative;
  padding-left: 1px;
  padding-right: 1px;
  display: flex;
  flex-direction: row;
  flex: 1;
  justify-content: center;
`;

const ClickableCell = styled(Cell)`
  &: hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

const HeaderLabel = styled.div`
  text-align: center;
  flex: 1;
`;

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

const TotalCell = styled.div`
  text-align: center;
  flex: 1;
  font-weight: bold;
`;

const Space = styled.div`
  height: 50px;
`;

const SaveButton = styled.div`
  color: white;
  border-radius: 3px;
  background-color: orange;
  line-height: 40px;
  padding: 0px 40px;
  cursor: pointer;
  display: inline-block;
  float: right;
  margin: 20px 30px;
  &:hover {
    opacity: 0.7;
  }
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
  bottom: 20px;
  font-weight: lighter;
  font-size: 12px;
`;
