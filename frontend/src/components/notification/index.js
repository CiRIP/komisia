import { h } from 'preact';
import { connect } from 'react-redux';

const Notifications = ({ notifications, onClick }) => (
	<div class="p-4">
		{notifications.map((notification) => (
			<div class="m-4 p-2 rounded-lg bg-gray-900 shadow-lg sm:p-3 text-white text-sm" onClick={() => onClick(notification.id)}>
				{notification.title ? <p>{notification.title}</p> : null}

				<p>{notification.text}</p>
			</div>
		))}
	</div >
);

const mapStateToProps = (state) => {
	const { notifications } = state;

	return { notifications };
};

const mapDispatchToProps = (dispatch) => {
	return {
		onClick: (notificationId) => {
			dispatch(stateActions.removeNotification(notificationId));
		}
	};
};

const connectedNotifications = connect(
	mapStateToProps,
	mapDispatchToProps
)(Notifications);

export default connectedNotifications;
