import React from 'react';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import { getFinancialTimeFromDate } from 'utils';
import Forecast from 'forecast';

class CompanyForecast extends React.Component {
  state = {
    company: null,
    profitCentres: null,
    financialYear: null,
  };

  async componentDidMount() {
    // Load user preferences
    const prefs = await getUserPreferences(this.props.$global.currentUser.id, this.props.$models);
    const { company_id, financialYear } = prefs;

    if (!(company_id && financialYear)) await this.setFilters();
    else {
      const company = await this.props.$models.Company.findById(company_id);
      const profitCentres = await this.props.$models.ProfitCentre.findAll({
        where: {
          company_id: company.id,
        },
        limit: 1000,
      });
      await this.setState({
        company,
        profitCentres,
        financialYear,
      });
    }
  }

  setFilters = async () => {
    const { $models, $popup } = this.props;

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
        companyId: this.state.company && this.state.company.id,
        financialYear: this.state.financialYear || getFinancialTimeFromDate().financialYear,
      },
      onSubmit: async ({ companyId, financialYear: selectedFinancialYear }) => {
        const selectedCompany = companies.find(com => com.id === companyId);
        const profitCentres = await this.props.$models.ProfitCentre.findAll({
          where: {
            company_id: companyId,
          },
          limit: 1000,
        });

        await this.setState({
          company: selectedCompany,
          profitCentres,
          financialYear: selectedFinancialYear,
        });
        setUserPreferences(this.props.$global.currentUser.id, $models, {
          company_id: companyId,
          financialYear: selectedFinancialYear,
        });
      },
    });
  };

  render() {
    const { company, profitCentres, financialYear } = this.state;
    if (!(company && financialYear)) return null;

    const title = `Company: ${company.name}`;

    return (
      <Forecast
        mode="company"
        title={title}
        financialYear={financialYear}
        profitCentreIds={profitCentres.map(pc => pc.id)}
        setFilters={this.setFilters}
        $models={this.props.$models}
      />
    );
  }
}

export default CompanyForecast;
