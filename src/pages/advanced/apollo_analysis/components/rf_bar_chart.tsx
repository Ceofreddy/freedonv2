import React, { PureComponent } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';

const renderCustomizedLabel = (props: any) => {
    const { x, y, width, value } = props;
    return (
        <text x={x + width + 5} y={y + 10} fill='#666' textAnchor='start' fontSize={12}>
            {value}
        </text>
    );
};

function calculateRiseAndFallPercentages(numbers: number[]): { risePercentage: number; fallPercentage: number } {
    let riseCount: number = 0;
    let fallCount: number = 0;
    const totalComparisons: number = numbers.length - 1; // Total comparisons are one less than the number of elements

    // Ensure there are at least two numbers to compare
    if (numbers.length < 2) {
        return { risePercentage: 0, fallPercentage: 0 };
    }

    // Iterate through the array to count rises and falls
    for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] > numbers[i - 1]) {
            riseCount++;
        } else if (numbers[i] < numbers[i - 1]) {
            fallCount++;
        }
        // If numbers[i] == numbers[i - 1], it's neither a rise nor a fall, so do nothing
    }

    // Calculate percentages
    const risePercentage: number = (riseCount / totalComparisons) * 100;
    const fallPercentage: number = (fallCount / totalComparisons) * 100;

    return {
        risePercentage: +risePercentage.toFixed(2),
        fallPercentage: +fallPercentage.toFixed(2),
    };
}

interface OverUnderProps {
    allDigitList: number[];
    is_mobile: boolean;
}

export default class RiseFallBarChart extends PureComponent<OverUnderProps> {
    render() {
        const { allDigitList, is_mobile } = this.props;
        const percentages: { risePercentage: number; fallPercentage: number } =
            calculateRiseAndFallPercentages(allDigitList);
        const data = [
            {
                name: `Rise`,
                percentage: +percentages.risePercentage.toFixed(2),
            },
            {
                name: `Fall`,
                percentage: +percentages.fallPercentage.toFixed(2),
            },
        ];

        const barColors = ['#4CAF50', '#F44336'];

        return (
            <ResponsiveContainer width='140%' height={211}>
                <BarChart
                    width={100}
                    height={211}
                    data={data}
                    layout='vertical'
                    margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray='3 3' />
                    <XAxis type='number' label='' />
                    <YAxis type='category' dataKey='name' />
                    <Tooltip />
                    <Bar dataKey='percentage' isAnimationActive={!is_mobile}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={barColors[index]} />
                        ))}
                        <LabelList dataKey='percentage' content={renderCustomizedLabel} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    }
}
