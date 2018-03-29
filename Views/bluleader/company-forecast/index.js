// Calculate forecast for all profit centers of a company
// for each element, the displayed result are sum of each profit center. This sum is displayed only - not stored

import React from 'react';
import { styled } from 'bappo-components';
import utils from 'utils';
import moment from 'moment';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import Report from './Report';

const {
  calculateForecast,
  getForecastEntryKey,
  getFinancialYear,
  generateMonthArray,
  getRosterEntryByElement,
  financialToCalendar,
} = utils;

const newEntry = (financialYear, month, element, amount) => ({
  newRecord: true,
  financialYear,
  financialMonth: month,
  forecastElement_id: element.id,
  forecastElement: element,
  amount: amount || '',
});

class ForecastMatrix extends React.Component {
  monthArray = [];

  state = {
    loading: true,
    company: null,
    financialYear: null,
    entries: {},
    profitCentres: [],
    saving: false,
    showReport: false,
  };

  async componentWillMount() {
    this.monthArray = generateMonthArray();

    // Load user preferences
    const prefs = await getUserPreferences(
      this.props.$global.currentUser.id,
      this.props.$models,
    );
    const { company_id, financialYear } = prefs;

    if (!(company_id && financialYear)) await this.setFilters();
    else {
      const company = await this.props.$models.Company.findById(company_id);
      await this.setState({
        company,
        financialYear,
      });
      await this.loadData();
    }
  }

  // Bring up a popup asking which company and financial year
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { company, financialYear } = this.state;

    const companies = await $models.Company.findAll({
      limit: 1000,
    });

    const companiesOptions = companies.map(com => ({
      id: com.id,
      label: com.name,
    }));

    $popup.form({
      fields: [
        {
          name: 'companyId',
          label: 'Company',
          type: 'FixedList',
          properties: {
            options: companiesOptions,
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
        companyId: company && company.id,
        financialYear: financialYear || getFinancialYear(),
      },
      onSubmit: async ({ companyId, financialYear: selectedFinancialYear }) => {
        const selectedCompany = companies.find(com => com.id === companyId);

        await this.setState({
          company: selectedCompany,
          financialYear: selectedFinancialYear,
        });
        await this.loadData();
        setUserPreferences(this.props.$global.currentUser.id, $models, {
          company_id: companyId,
          financialYear: selectedFinancialYear,
        });
      },
    });
  };

  loadData = async () => {
    const { financialYear, company } = this.state;
    if (!(financialYear && company)) return;

    this.setState({ loading: true });

    const { ProfitCentre, ForecastEntry, ForecastElement } = this.props.$models;

    // Find all profit centres
    const profitCentres = await ProfitCentre.findAll({
      where: {
        company_id: company.id,
      },
    });

    const profitCentreIds = profitCentres.map(pc => pc.id);

    const entries_array = await ForecastEntry.findAll({
      include: [
        { as: 'profitCentre' },
        { as: 'costCentre' },
        { as: 'forecastElement' },
      ],
      limit: 100000,
      where: {
        active: true,
        financialYear,
        profitCentre_id: {
          $in: profitCentreIds,
        },
      },
    });

    const elements = await ForecastElement.findAll({});
    const cos_elements = [];
    const rev_elements = [];
    const oh_elements = [];

    const entries = {};
    for (const entry of entries_array) {
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
          name: entry.name,
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

      // Create new entries for empty cells
      this.monthArray.forEach(month => {
        const key = getForecastEntryKey(
          financialYear,
          month.financialMonth,
          element.id,
          true,
        );
        entries[key] =
          entries[key] ||
          newEntry(financialYear, month.financialMonth, element);
      });
    }

    // Find all related cost centers, for later use
    // const costCenters = await CostCenter.findAll({
    //   where: {
    //     profitCentre_id: {
    //       $in: profitCentreIds,
    //     },
    //   },
    // });

    await this.setState({
      loading: false,
      entries,
      profitCentres,
      // elements,
      cos_elements,
      rev_elements,
      oh_elements,
      totals: this.calcTotals(entries),
    });
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
      t.cos[financialMonth] = 0.0;
      t.rev[financialMonth] = 0.0;
      t.oh[financialMonth] = 0.0;
      t.gp[financialMonth] = 0.0;
      t.np[financialMonth] = 0.0;
    });

    return t;
  };

  renderRow = element => (
    <Row>
      <RowLabel>
        <span>{element.name}</span>
      </RowLabel>
      {this.monthArray.map(month =>
        this.renderCell(month.financialMonth, element),
      )}
    </Row>
  );

  renderCell = (financialMonth, element) => {
    const key = getForecastEntryKey(
      this.state.financialYear,
      financialMonth,
      element.id,
      true,
    );
    const entry = this.state.entries[key];

    const amount = entry && entry.amount;

    return (
      <Cell onClick={() => this.calculateReportData(element, financialMonth)}>
        {amount === 0 ? '' : amount}
      </Cell>
    );
  };

  // Calculate all rows that need to, update db, reload data and calculate total
  calculateRows = async () => {
    this.setState({ saving: true });

    const { profitCentres, financialYear } = this.state;

    await calculateForecast({
      $models: this.props.$models,
      financialYear,
      profitCentreIds: profitCentres.map(pc => pc.id),
    });

    await this.loadData();

    await this.setState(state => ({
      totals: this.calcTotals(state.entries),
      saving: false,
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

  renderTotal = (month, key) => (
    <TotalCell>{this.state.totals[key][month]}</TotalCell>
  );

  renderTotals = (key, label) => (
    <RowSubTotal>
      <RowLabel style={{ fontWeight: 'bold' }}> {label} </RowLabel>
      {this.monthArray.map(month =>
        this.renderTotal(month.financialMonth, key),
      )}
    </RowSubTotal>
  );

  calculateReportData = async (element, financialMonth) => {
    const { profitCentres, financialYear } = this.state;

    switch (element.key) {
      case 'CWAGES': {
        // Contractor wages
        const wageEntries = await getRosterEntryByElement({
          $models: this.props.$models,
          financialTime: {
            financialYear,
            financialMonth,
          },
          projectIds: profitCentres.map(pc => pc.id),
        });

        const { calendarYear, calendarMonth } = financialToCalendar({
          financialYear,
          financialMonth,
        });

        const wageByConsultant = {};

        wageEntries.forEach(e => {
          if (!wageByConsultant[e.consultant.name]) {
            wageByConsultant[e.consultant.name] = +e.consultant.dailyRate;
          } else wageByConsultant[e.consultant.name] += +e.consultant.dailyRate;
        });

        return this.setState({
          showReport: true,
          reportData: {
            name: 'Contractor Wages',
            time: `${moment()
              .month(calendarMonth - 1)
              .format('MMM')} ${calendarYear}`,
            data: wageByConsultant,
          },
        });
      }
      default:
    }
  };

  render() {
    const {
      loading,
      saving,
      company,
      financialYear,
      showReport,
      reportData,
    } = this.state;

    if (loading) {
      return <Loading>Loading...</Loading>;
    }

    if (!(company && financialYear)) {
      return (
        <Loading>
          Please specify a company and financial year to continue.
          <TextButton onClick={this.setFilters}>change</TextButton>
        </Loading>
      );
    }

    return (
      <Container saving={saving}>
        <HeaderContainer>
          <Heading>
            Company: {company.name}, financial year {financialYear}
          </Heading>
          <TextButton onClick={this.setFilters}>change</TextButton>
          <TextButton onClick={this.calculateRows}>calculate</TextButton>
        </HeaderContainer>
        <HeaderRow>
          <RowLabel />
          {this.monthArray.map(({ label }) => (
            <Cell>
              {label === 'Jan' && <YearLabel>{+financialYear + 1}</YearLabel>}
              <HeaderLabel>{label}</HeaderLabel>{' '}
            </Cell>
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

        {showReport && <Report {...reportData} />}
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

  &: hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

const HeaderLabel = styled.div`
  text-align: center;
  flex: 1;
`;

const Container = styled.div`
  ${props =>
    props.saving ? 'filter: blur(3px); opacity: 0.5;' : ''} margin-top: 50px;
  overflow-y: scroll;
`;

const TotalCell = styled.div`
  text-align: center;
  flex: 1;
  font-weight: bold;
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
  bottom: 20px;
  font-weight: lighter;
  font-size: 12px;
`;
