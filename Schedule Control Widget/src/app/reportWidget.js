import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {Button, ButtonGroup, DatePicker, Group, Panel, Text} from "@jetbrains/ring-ui";
import Select from '@jetbrains/ring-ui/components/select/select';
import Island, {Header, Content} from "@jetbrains/ring-ui/components/island/island";
import closeIcon from '@jetbrains/icons/close.svg';
import Icon from "@jetbrains/ring-ui/components/icon";
import {getReportData} from "./api-interaction";
import {getDateLabel, getFromToDateObj, getPeriodsArray, periodsData} from "./date-helper";
import QueryAssist from "@jetbrains/ring-ui/components/query-assist/query-assist";
import Alert from "@jetbrains/ring-ui/components/alert/alert";
import {Input} from "@jetbrains/ring-ui/components/input/input";
import EmptyWidget from '@jetbrains/hub-widget-ui/dist/empty-widget';
import TableContainer from "@material-ui/core/TableContainer";
import Paper from "@material-ui/core/Paper";
import Table from "@material-ui/core/Table";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import TableCell from "@material-ui/core/TableCell";
import TableBody from "@material-ui/core/TableBody";
import Radio from "@jetbrains/ring-ui/components/radio/radio";
import Badge from "@jetbrains/ring-ui/components/badge/badge";


export default class ReportWidget extends Component {
    static propTypes = {
        dashboardApi: PropTypes.object,
        registerWidgetApi: PropTypes.func,
        throwAlert: PropTypes.func,
        closeAlert: PropTypes.func,
        userId: PropTypes.string,
        isManager: PropTypes.bool,
        isManagersWidget: PropTypes.bool,
        isExistingWidget: PropTypes.bool
    };

    //TODO:test
    constructor(props) {
        super(props);

        if (props.isManager || !props.isExistingWidget && !props.isManagersWidget) {
            props.registerWidgetApi({
                onConfigure: () => this.setState({isConfiguring: true}),
                onRefresh: () => this.check()
            });
        } else {
            props.registerWidgetApi({
                onRefresh: () => {
                    this.check()
                }
            });
        }

        this.state = {
            chosenEmployees: [],
            availableEmployees: null,
            reportData: [],
            projects: [],
            selectedProjects: [],
            selectedPeriods: [],
            from: null,
            to: null,
            serviceId: null,
            workTypes: [],
            selectedWorkTypes: [],
            isConfiguring: false,
            isExistingWidget: props.isExistingWidget,
            isManagersWidget: props.isManagersWidget,
            calculatedTime: Date.now(),
            isRefreshing: false,
            didMount: false,
            isReportForMyself: true,
            myEmployees: [],
        };
    };

    saveState = async (dashboardApi, state) => {
        state.selectedPeriods = state.selectedPeriods.map(period => period.label);
        state.selectedPeriod = state.selectedPeriod ? state.selectedPeriod.label : null;
        state.isConfiguring = false;
        delete state.didMount;
        await dashboardApi.storeConfig(state);
    };
    readState = async (dashboardApi) => {
        const config = await dashboardApi.readConfig();
        if (config && config.selectedPeriods && config.chosenEmployees) {
            config.selectedPeriod = config.selectedPeriod ? getPeriodsArray([config.selectedPeriod])[0] : null;
            config.selectedPeriods = getPeriodsArray(config.selectedPeriods);
            this.props.dashboardApi.setTitle(config.title ?? this.DEFAULT_TITLE);
            this.setState({...config});
        }
    };

    async componentDidMount() {
        const props = this.props;
        await this.readState(props.dashboardApi);
        if (this.state.isExistingWidget) {
            this.check();
        }
        let serviceId = null;
        await props.dashboardApi.fetchHub("rest/services").then(servicesPage => {
            serviceId = servicesPage.services.filter(service => service.name === "YouTrack")[0].id;
            this.setState({serviceId});
        }).catch(err => props.throwAlert("при загрузке менеджер виджета при запросе 'rest/services'", Alert.Type.ERROR));

        props.dashboardApi.fetch(serviceId, "api/users?fields=login,email,fullName")
            .then(users => {
                let emails = users
                    .filter(user => user.hasOwnProperty('email') && user.email)
                    .map(user => {
                        return {userEmail: user.email, userLogin: user.login, fullName: user.fullName}
                    }).map(user => {
                        return {label: user.userEmail, key: user}
                    });
                emails.push({
                    key: {fullName: "Бабин Константин", userEmail: "graf.rav@gmail.com", userLogin: "graf.rav"},
                    label: "babin@hightech.group"
                })
                this.setState({
                    myEmployees: emails.map(x => {
                        return {label: x.label, key: x.label}
                    })
                })
                this.setState({availableEmployees: emails})
            }).then(
            props.dashboardApi.fetch(serviceId, "rest/project/all").then(async returnedProjects => {
                const projects = returnedProjects.filter(project => project.name !== "Global").map(project => {
                    return {label: project.name, key: project.shortName}
                });
                let workTypes = [];
                for (const project of projects) {
                    await props.dashboardApi.fetch(serviceId, `rest/admin/project/${project.key}/timetracking/worktype`)
                        .then(returnedWorkTypes => workTypes = workTypes.concat(returnedWorkTypes.map(returnedWorkType => returnedWorkType.name)))
                }
                workTypes = [...new Set(workTypes)].map(wt => {
                    return {label: wt, key: wt}
                });
                this.setState({projects, workTypes, didMount: true})
            })).catch(err => props.throwAlert("при загрузке менеджер виджета при запросе 'api/users?fields=login,email,fullName' или 'rest/project/all'", Alert.Type.ERROR));

    }

    canCreate = () => {
        const {chosenEmployees, selectedPeriods, isReportForMyself} = this.state;
        return chosenEmployees.length !== 0 && selectedPeriods.length !== 0 || selectedPeriods.length !== 0 && isReportForMyself
    };
    getSumByPeriod = (period) => {
        const {reportData} = this.state;
        let sumPlan = 0;
        let sumFact = 0;
        reportData.map(user => user.periods).reduce(function (a, b) {
            return a.concat(b);
        }).filter(repPeriod => {
            return repPeriod.label === period.label
        }).forEach(period => {
            sumFact += period.fact ?? 0;
            sumPlan += period.plan
        });
        return {sumFact, sumPlan}
    };

    check = () => {
        const props = this.props;
        const alert = props.throwAlert("Идет подготовка отчета", Alert.Type.LOADING);
        const {chosenEmployees, availableEmployees} = this.state;
        let reportEmployees = availableEmployees.filter(x => chosenEmployees.filter(y => y.label === x.label).length !== 0)
        getReportData(props.dashboardApi, {
            ...this.state,
            chosenEmployees: reportEmployees
        }, props.userId, props.throwAlert)
            .then(async reportData => {
                    props.closeAlert(alert);
                    await this.saveState(props.dashboardApi, {...this.state, isExistingWidget: true, isConfiguring: false});
                    this.setState({
                        isConfiguring: false,
                        reportData, isExistingWidget: true, calculatedTime: Date.now()
                    });

                    await this.props.dashboardApi.exitConfigMode();
                }
            ).catch(async err => {
            this.setState({isConfiguring: false});
            props.throwAlert("в чеке", Alert.Type.ERROR);
            await this.props.dashboardApi.exitConfigMode();
        });
    };
    cancelConfig = async () => {
        this.setState({isConfiguring: false});
        await this.props.dashboardApi.exitConfigMode();
    };
    onChangePeriod = (a, b) => {
        const constData = this.state.selectedPeriods.filter(x => periodsData.filter(y => y.label === x.label).length === 0);
        a = a.concat(constData);
        this.setState({selectedPeriods: a});
    };
    setRange = ({from, to}) => {
        this.setState({from, to});
        if (from && to) {
            let fromDate = new Date(from);
            let toDate = new Date(to);
            this.setState({from: null, to: null});

            const period = {
                label: getDateLabel(fromDate, toDate),
                getPeriod: () => getFromToDateObj(fromDate, toDate)
            };
            const {selectedPeriods} = this.state;
            if (!period) {
                return
            }
            if (!selectedPeriods.filter(selectedPeriod => selectedPeriod.label === period.label)[0]) {
                selectedPeriods.push(period);
                this.setState({selectedPeriods});
            }
        }
    };
    deletePeriod = (period) => this.setState({selectedPeriods: this.state.selectedPeriods.filter(selectedPeriod => selectedPeriod.label !== period.label)});

    projectMultipleConfig = {selectAll: true};
    workTypeMultipleConfig = {selectAll: true};
    periodMultipleConfig = {selectAll: true};
    employeeMultipleConfig = {selectAll: true};

    onChangeProject = (a, b) => {
        this.setState({selectedProjects: a})
    }
    deleteProject = (project) => this.setState({selectedProjects: this.state.selectedProjects.filter(selectedProject => selectedProject.key !== project.key)});

    onChangeWorkType = (a, b) => {
        this.setState({selectedWorkTypes: a})
    }
    deleteWorkType = (workType) => this.setState({selectedWorkTypes: this.state.selectedWorkTypes.filter(selectWorkType => selectWorkType.label !== workType.label)});

    onChangeEmployee = (a, b) => {
        this.setState({chosenEmployees: a});
    }
    unChoseEmployee = (label) => {
        const newChosen = this.state.chosenEmployees.filter(x => x.label !== label);
        this.setState({chosenEmployees: newChosen});
    };

    dataSource = props => {
        const {serviceId} = this.state;
        const params = {
            query: {
                ...props,
                fields: `query,caret,styleRanges(length,start,style,title),suggestions(auxiliaryIcon,caret,className,completionEnd,completionStart,description,group,icon,matchingEnd,matchingStart,option,prefix,suffix)`
            }
        };
        return this.props.dashboardApi.fetch(`${serviceId}`, `api/search/assist?$top=-1&fields=${params.query.fields}`, {
            method: "POST",
            body: {
                query: params.query.query,
                caret: params.query.caret,
                folders: params.query.hasOwnProperty("folders") ? params.query.folders : []
            }
        });
    };
    accept = issueFilter => {
        this.setState({issueFilter: issueFilter.query});
    };
    changeTitle = e => this.setState({
        title: e.target.value
    });
    DEFAULT_TITLE = "Schedule Control Report";

    renderConfiguration() {
        const {
            title, issueFilter, chosenEmployees, projects,
            selectedProjects, selectedPeriods, from, to, selectedWorkTypes, workTypes, isReportForMyself, isManagersWidget
        } = this.state;
        this.props.dashboardApi.setTitle(title ?? this.DEFAULT_TITLE);
        return (
            <div>
                <div>
                    <Content>
                        <strong>{"Название репорта:"}</strong>
                        <Input
                            onChange={this.changeTitle}
                            value={title ?? this.DEFAULT_TITLE}
                        />
                        <strong>{"Issue Filter:"}</strong>
                        <QueryAssist
                            placeholder="Введите фильтр и нажмите Enter"
                            glass
                            clear
                            onApply={this.accept}
                            focus
                            query={issueFilter}
                            dataSource={this.dataSource}
                        />
                    </Content>
                    <Content>
                        <strong>{"Выбор Worktype:"}</strong>
                        <div>
                            <Group>
                                <Select
                                    filter
                                    multiple={this.workTypeMultipleConfig}
                                    selected={selectedWorkTypes}
                                    data={workTypes}
                                    onChange={this.onChangeWorkType}
                                />
                                {
                                    selectedWorkTypes == false
                                        ? <Text>{"или все worktype будут рассмотрены"}</Text>
                                        : selectedWorkTypes.map(workType =>
                                            <Badge key={workType.key}>
                                                {workType.label + " "}
                                                <Icon className="ring-icon" glyph={closeIcon}
                                                      onClick={() => this.deleteWorkType(workType)}/>
                                            </Badge>)
                                }
                            </Group>
                        </div>
                    </Content>
                    <Content>
                        <strong>{"Выбор проекта:"}</strong>
                        <div>
                            <Group>
                                <Select
                                    filter
                                    multiple={this.projectMultipleConfig}
                                    selected={selectedProjects}
                                    data={projects}
                                    onChange={this.onChangeProject}
                                />
                                {
                                    selectedProjects == false
                                        ? <Text>{"или Issue из всех проектов будут рассмотрены"}</Text>
                                        : selectedProjects.map(project =>
                                            <Badge key={project.key}>
                                                {project.label + " "}
                                                <Icon className="ring-icon" glyph={closeIcon}
                                                      onClick={() => this.deleteProject(project)}/>
                                            </Badge>)
                                }
                            </Group>
                        </div>
                    </Content>
                    <Content>
                        <strong>{"Выбор периодов:"}</strong>
                        <div>
                            <Group>
                                <Select
                                    filter
                                    multiple={this.periodMultipleConfig}
                                    selected={selectedPeriods.filter(x => periodsData.filter(y => y.label === x.label).length !== 0)}
                                    data={periodsData}
                                    onChange={this.onChangePeriod}
                                />
                                <Text>{"Или"}</Text>
                                <DatePicker
                                    rangePlaceholder={"Фиксированный период"} from={from} to={to}
                                    onChange={this.setRange}
                                    range
                                />
                                {
                                    selectedPeriods == false
                                        ? <Text style={{color: "red"}}>{"Выберите период"}</Text>
                                        : selectedPeriods.map(period =>
                                            <Badge key={period.key}>
                                                {period.label + " "}
                                                <Icon className="ring-icon" glyph={closeIcon}
                                                      onClick={() => this.deletePeriod(period)}/>
                                            </Badge>)
                                }
                            </Group>
                        </div>
                    </Content>
                    <Content>
                        {
                            isManagersWidget ? <Radio value={isReportForMyself.toString()}
                                                      onChange={(value) => this.setState({isReportForMyself: value === "true"})}>
                                <Radio.Item value={"true"}>для Me</Radio.Item>
                                <Radio.Item value={"false"}>Выбор группы сотрудников</Radio.Item>
                            </Radio> : <div></div>
                        }

                        {
                            !isReportForMyself
                                ?
                                <div>
                                    <strong>{"Выбор сотрудников:"}</strong>
                                    <div>
                                        <Group>
                                            <Select
                                                filter
                                                multiple={this.employeeMultipleConfig}
                                                selected={chosenEmployees}
                                                data={this.state.myEmployees}
                                                onChange={this.onChangeEmployee}
                                            />
                                            {
                                                chosenEmployees == false
                                                    ? <Text style={{color: "red"}}>{"Сотрудники не выбраны"}</Text>
                                                    : chosenEmployees.map(employee =>
                                                        <Badge key={employee.key}>
                                                            {employee.label + " "}
                                                            <Icon className="ring-icon" glyph={closeIcon}
                                                                  onClick={() => this.unChoseEmployee(employee.label)}/>
                                                        </Badge>)
                                            }
                                        </Group>
                                    </div>
                                </div>
                                : <></>
                        }


                    </Content>
                    <Panel>
                        <Button primary disabled={!this.canCreate()} onClick={this.check}>{"Сохранить"}</Button>
                        <Button onClick={this.cancelConfig}>{'Отменить'}</Button>
                    </Panel>
                </div>
            </div>
        );
    }

    render() {
        const {
            reportData, isConfiguring, isExistingWidget, calculatedTime, didMount
        } = this.state;
        console.log(this.state, this.props, isExistingWidget);
        if (!didMount) {
            return (<text>{"loading..."}</text>)
        }
        if (isConfiguring) {
            return this.renderConfiguration();
        }
        if (!isExistingWidget || reportData.length === 0) {
            return (
                <EmptyWidget message={"Для настройки виджета откройте пункт Edit..."} face={"(⌒‿⌒)"}/>)
        }
        const resultFactPlans = reportData[0].periods.map(period => this.getSumByPeriod(period));
        return (
            <div>
                <Text info>{`Report was calculated in ${new Date(calculatedTime).toLocaleString()}`}</Text>

                <TableContainer component={Paper}>
                    <Table size="small" aria-label="simple table">
                        <colgroup span="2"></colgroup>
                        <TableHead>
                            <TableRow>
                                <TableCell rowSpan="2">{"Сотрудник"}</TableCell>
                                {
                                    reportData[0].periods.map(period =>
                                        <TableCell align={"center"} colSpan="2"
                                                   scope="colgroup">{period.label}</TableCell>)
                                }
                            </TableRow>
                            <TableRow>
                                {
                                    reportData[0].periods.map(period =>
                                        <>
                                            <TableCell align={"center"} scope="col">{"План"}</TableCell>
                                            <TableCell align={"center"} scope="col">{"Факт"}</TableCell>
                                        </>)
                                }
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {reportData.map(user => <TableRow>
                                <TableCell scope="row">{user.fullName}</TableCell>
                                {
                                    user.periods.map(period =>
                                        <>
                                            <TableCell align={"center"}>{period.plan ?? 0}</TableCell>
                                            <TableCell align={"center"}
                                                       style={{color: period.fact < period.plan || !period.fact ? "red" : "green"}}>{period.fact ? Math.round(period.fact) : 0}</TableCell>
                                        </>)
                                }
                            </TableRow>)}
                            <TableRow>
                                <TableCell rowSpan="2"><b>{"Итого:"}</b></TableCell>
                                {resultFactPlans.map(period =>
                                    <>
                                        <TableCell align={"center"} scope="col">{period.sumPlan ?? 0}</TableCell>
                                        <TableCell align={"center"} scope="col"
                                                   style={{color: period.sumFact < period.sumPlan || !period.sumFact ? "red" : "green"}}>{period.sumFact ? Math.round(period.sumFact) : 0}</TableCell>
                                    </>)
                                }
                            </TableRow>
                        </TableBody>
                    </Table>
                </TableContainer>
            </div>
        )
    }
}