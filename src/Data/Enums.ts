/** Defines the set of states a timer can be in */
export enum TimerState {
	/** The timer is not running at all  */
	NotRunning,

	/** The timer has started but is currently paused  */
	Paused,

	/** The timer is currently running  */
	Running,
}

/** Defines the set of reasons why a timer would stop */
export enum TimerStopCause {
	/** The timer was stopped prematurely  */
	Stopped,

	/** The timer completed in its entirety  */
	Completed,
}
