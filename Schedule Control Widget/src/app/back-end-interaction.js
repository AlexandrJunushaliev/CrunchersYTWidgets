/*export const get1cData = async (emails, periods, userId) => {
    let response = await postData("", {
        emails, periods: periods.map(period => {
            return {from: period.from.toISOString(), to: period.to.toISOString()}
        }), userId
    });
    response.users
        .forEach(user => user.periods
            .forEach(period => period.label = periods
                .filter(reqPeriod => reqPeriod.from.toISOString() === period.from && reqPeriod.to.toISOString() === period.to)[0].label));
    return response;
};
async function postData(url = '', data = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    return await response.json();
}*/


function randomInteger(min, max) {
    let rand = min - 0.5 + Math.random() * (max - min + 1);
    return Math.round(rand);
}
export const get1cData = async (emails, periods,userId) => {
    const res = emails.map(email => {
        const newPeriods = periods.map(period => {
                return {
                    from: period.from.toISOString(),
                    to: period.to.toISOString(),
                    plan: -1
                }
            }
        );
        return {email: email, periods: newPeriods}
    });
    const response = {users: res};
    response.users
        .forEach(user => user.periods
            .forEach(period => period.label = periods
                .filter(reqPeriod => reqPeriod.from.toISOString() === period.from && reqPeriod.to.toISOString() === period.to)[0].label));
    return response;
};
